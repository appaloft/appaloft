import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import {
  deploymentProgressSteps,
  type AppLogger,
  type DeploymentProgressReporter,
  type EdgeProxyProviderRegistry,
  type ExecutionBackend,
  type ExecutionContext,
  type IntegrationAuthPort,
  reportDeploymentProgress,
} from "@appaloft/application";
import {
  DeploymentLogEntry,
  DeploymentLogSourceValue,
  DeploymentPhaseValue,
  domainError,
  ErrorCodeText,
  ExecutionResult,
  ExecutionStatusValue,
  ExitCode,
  FinishedAt,
  LogLevelValue,
  MessageText,
  OccurredAt,
  err,
  ok,
  type Deployment,
  type Result,
  type RollbackPlan,
  type RuntimeExecutionPlan,
} from "@appaloft/core";
import {
  createEdgeProxyEnsurePlan,
  createProxyReloadPlan,
  createProxyRouteRealizationPlan,
  proxyBootstrapOptionsFromEnv,
} from "./edge-proxy-plans";
import { executeProxyReloadPlan } from "./proxy-reload-execution";
import {
  dockerPublishedPortCommand,
  parseDockerPublishedHostPort,
  appaloftDockerContainerLabels,
} from "./docker-container-commands";
import {
  RuntimeCommandBuilder,
  dockerLabelsFromAssignments,
  renderRuntimeCommandString,
} from "./runtime-commands";
import { generateWorkspaceDockerfile } from "./workspace-planners";

type LogPhase = "detect" | "plan" | "package" | "deploy" | "verify" | "rollback";
type LogLevel = "debug" | "info" | "warn" | "error";
type LogSource = "appaloft" | "application";

const persistedOutputLineLimit = 50;

function phaseLog(
  phase: LogPhase,
  message: string,
  level: LogLevel = "info",
  source: LogSource = "appaloft",
): DeploymentLogEntry {
  return DeploymentLogEntry.rehydrate({
    timestamp: OccurredAt.rehydrate(new Date().toISOString()),
    source: DeploymentLogSourceValue.rehydrate(source),
    phase: DeploymentPhaseValue.rehydrate(phase),
    level: LogLevelValue.rehydrate(level),
    message: MessageText.rehydrate(message),
  });
}

function normalizeWorkingDirectory(locator: string): string {
  const resolved = resolve(locator);
  if (existsSync(resolved)) {
    return resolved;
  }

  return dirname(resolved);
}

function isGitHubHttpsLocator(locator: string): boolean {
  try {
    const parsed = new URL(locator);
    return parsed.protocol === "https:" && parsed.hostname.toLowerCase() === "github.com";
  } catch {
    return false;
  }
}

function withGitHubAccessToken(locator: string, accessToken: string): string {
  const parsed = new URL(locator);
  parsed.username = "x-access-token";
  parsed.password = accessToken;
  return parsed.toString();
}

function isRemoteGitSourceKind(kind: string): boolean {
  return (
    kind === "remote-git" ||
    kind === "git-public" ||
    kind === "git-github-app" ||
    kind === "git-deploy-key"
  );
}

function sourceBaseDirectory(metadata?: Record<string, string>): string | undefined {
  const baseDirectory = metadata?.baseDirectory?.replace(/^\/+/, "").replace(/\/+$/, "");
  return baseDirectory ? baseDirectory : undefined;
}

function sourceWorkdir(root: string, metadata?: Record<string, string>): string {
  const baseDirectory = sourceBaseDirectory(metadata);
  return baseDirectory ? resolve(root, baseDirectory) : root;
}

function redactSecrets(input: string, secrets: readonly string[] = []): string {
  return secrets.reduce(
    (text, secret) => (secret.length > 0 ? text.replaceAll(secret, "[redacted]") : text),
    input,
  );
}

function deploymentEnv(
  deployment: Deployment,
  port?: number,
): NodeJS.ProcessEnv {
  const state = deployment.toState();
  const env = {
    ...process.env,
    APPALOFT_DEPLOYMENT_ID: state.id.value,
    APPALOFT_PROJECT_ID: state.projectId.value,
    APPALOFT_ENVIRONMENT_ID: state.environmentId.value,
    APPALOFT_RESOURCE_ID: state.resourceId.value,
    APPALOFT_DESTINATION_ID: state.destinationId.value,
  } as NodeJS.ProcessEnv;

  for (const variable of state.environmentSnapshot.variables) {
    env[variable.key] = variable.value;
  }

  if (port) {
    env.PORT = String(port);
  }

  return env;
}

async function reservePort(preferred?: number): Promise<number> {
  if (preferred) {
    await new Promise<void>((resolvePort, reject) => {
      const server = createServer();
      server.listen(preferred, "0.0.0.0", () => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolvePort();
        });
      });
      server.on("error", (error) => {
        reject(new Error(`Port ${preferred} is not available: ${error.message}`));
      });
    });
    return preferred;
  }

  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to reserve local port"));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolvePort(port);
      });
    });
    server.on("error", reject);
  });
}

interface HttpHealthCheckOptions {
  method: string;
  expectedStatusCode: number;
  expectedResponseText?: string;
  intervalMs: number;
  timeoutMs: number;
  retries: number;
  startPeriodMs: number;
}

function httpHealthCheckOptions(
  execution: RuntimeExecutionPlan,
): HttpHealthCheckOptions | null {
  const policy = execution.healthCheck;
  if (policy && !policy.enabled) {
    return null;
  }
  return {
    method: policy?.http?.method.value ?? "GET",
    expectedStatusCode: policy?.http?.expectedStatusCode.value ?? 200,
    ...(policy?.http?.expectedResponseText
      ? { expectedResponseText: policy.http.expectedResponseText.value }
      : {}),
    intervalMs: (policy?.intervalSeconds.value ?? 0.25) * 1000,
    timeoutMs: (policy?.timeoutSeconds.value ?? 5) * 1000,
    retries: policy?.retries.value ?? 40,
    startPeriodMs: (policy?.startPeriodSeconds.value ?? 0) * 1000,
  };
}

async function waitForHealth(
  url: string,
  options: HttpHealthCheckOptions,
): Promise<{ ok: boolean; reason?: string }> {
  let lastFailure = "health check timed out";

  if (options.startPeriodMs > 0) {
    await Bun.sleep(options.startPeriodMs);
  }

  for (let attempt = 0; attempt < options.retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(url, {
        method: options.method,
        signal: controller.signal,
      });
      const responseText = options.expectedResponseText ? await response.text() : "";
      if (
        response.status === options.expectedStatusCode &&
        (!options.expectedResponseText || responseText.includes(options.expectedResponseText))
      ) {
        return { ok: true };
      }
      lastFailure = `last response was HTTP ${response.status} ${response.statusText}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : "unknown fetch error";
    } finally {
      clearTimeout(timeout);
    }

    await Bun.sleep(options.intervalMs);
  }

  return { ok: false, reason: lastFailure };
}

function sanitizeName(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
}

function shellQuote(input: string): string {
  return `'${input.replaceAll("'", "'\\''")}'`;
}

function runSyncCommand(input: {
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  redactions?: readonly string[];
}): {
  exitCode: number;
  stdout: string;
  stderr: string;
  failed: boolean;
  reason?: string;
} {
  const result = spawnSync(input.command, {
    cwd: input.cwd,
    env: input.env,
    shell: true,
    encoding: "utf8",
  });

  return {
    exitCode: result.status ?? 1,
    stdout: redactSecrets(result.stdout ?? "", input.redactions),
    stderr: redactSecrets(result.stderr ?? "", input.redactions),
    failed: result.status !== 0,
    ...(result.signal ? { reason: `terminated by signal ${result.signal}` } : {}),
  };
}

function runSyncProcess(input: {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  redactions?: readonly string[];
}): {
  exitCode: number;
  stdout: string;
  stderr: string;
  failed: boolean;
  reason?: string;
} {
  const result = spawnSync(input.command, input.args, {
    cwd: input.cwd,
    env: input.env,
    encoding: "utf8",
  });

  return {
    exitCode: result.status ?? 1,
    stdout: redactSecrets(result.stdout ?? "", input.redactions),
    stderr: redactSecrets(result.stderr ?? "", input.redactions),
    failed: result.status !== 0,
    ...(result.signal ? { reason: `terminated by signal ${result.signal}` } : {}),
    ...(result.error ? { reason: result.error.message } : {}),
  };
}

class LineBuffer {
  private pending = "";

  push(chunk: string): string[] {
    const combined = `${this.pending}${chunk}`;
    const parts = combined.split(/\r?\n/);
    this.pending = parts.pop() ?? "";
    return parts.map((line) => line.trim()).filter((line) => line.length > 0);
  }

  flush(): string[] {
    const line = this.pending.trim();
    this.pending = "";
    return line ? [line] : [];
  }
}

function classifyOutputLogLevel(line: string, fallback: LogLevel): LogLevel {
  const normalized = line.toLowerCase();
  if (/\b(error|failed|failure|fatal)\b/.test(normalized)) {
    return "error";
  }

  if (/\b(warn|warning)\b/.test(normalized)) {
    return "warn";
  }

  return fallback === "error" ? "error" : "info";
}

async function runStreamingCommand(input: {
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  redactions?: readonly string[];
  onOutput(line: string, level: LogLevel, stream: "stdout" | "stderr"): void;
}): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  failed: boolean;
  reason?: string;
}> {
  if (!existsSync(input.cwd) || !statSync(input.cwd).isDirectory()) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "",
      failed: true,
      reason: `working directory does not exist: ${input.cwd}`,
    };
  }

  return await new Promise((resolveCommand) => {
    const child = spawn(input.command, {
      cwd: input.cwd,
      env: input.env,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = new LineBuffer();
    const stderr = new LineBuffer();
    let stdoutText = "";
    let stderrText = "";
    let spawnReason: string | undefined;

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");

    child.stdout?.on("data", (chunk: string) => {
      stdoutText += chunk;
      for (const line of stdout.push(chunk)) {
        const redactedLine = redactSecrets(line, input.redactions);
        input.onOutput(redactedLine, classifyOutputLogLevel(redactedLine, "info"), "stdout");
      }
    });

    child.stderr?.on("data", (chunk: string) => {
      stderrText += chunk;
      for (const line of stderr.push(chunk)) {
        const redactedLine = redactSecrets(line, input.redactions);
        input.onOutput(redactedLine, classifyOutputLogLevel(redactedLine, "info"), "stderr");
      }
    });

    child.on("error", (error) => {
      spawnReason = error.message;
    });

    child.on("close", (code, signal) => {
      for (const line of stdout.flush()) {
        const redactedLine = redactSecrets(line, input.redactions);
        input.onOutput(redactedLine, classifyOutputLogLevel(redactedLine, "info"), "stdout");
      }
      for (const line of stderr.flush()) {
        const redactedLine = redactSecrets(line, input.redactions);
        input.onOutput(redactedLine, classifyOutputLogLevel(redactedLine, "info"), "stderr");
      }

      resolveCommand({
        exitCode: code ?? 1,
        stdout: redactSecrets(stdoutText, input.redactions),
        stderr: redactSecrets(stderrText, input.redactions),
        failed: code !== 0,
        ...(signal ? { reason: `terminated by signal ${signal}` } : {}),
        ...(spawnReason ? { reason: spawnReason } : {}),
      });
    });
  });
}

class AppLogTailer {
  private readonly lines = new LineBuffer();
  private offset: number;
  private interval: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly path: string,
    private readonly onLine: (line: string) => void,
  ) {
    this.offset = existsSync(path) ? statSync(path).size : 0;
  }

  start(): void {
    this.interval = setInterval(() => {
      this.poll();
    }, 100);
    this.interval.unref?.();
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    this.poll();
    for (const line of this.lines.flush()) {
      this.onLine(line);
    }
  }

  private poll(): void {
    if (!existsSync(this.path)) {
      return;
    }

    const size = statSync(this.path).size;
    if (size <= this.offset) {
      return;
    }

    const length = size - this.offset;
    const buffer = Buffer.alloc(length);
    const fd = openSync(this.path, "r");
    try {
      readSync(fd, buffer, 0, length, this.offset);
    } finally {
      closeSync(fd);
    }
    this.offset = size;

    for (const line of this.lines.push(buffer.toString("utf8"))) {
      this.onLine(line);
    }
  }
}

function killProcess(pid: string | undefined): void {
  if (!pid) {
    return;
  }

  try {
    process.kill(-Number(pid), "SIGTERM");
  } catch {
    try {
      process.kill(Number(pid), "SIGTERM");
    } catch {
      // process may already be gone
    }
  }
}

export class LocalExecutionBackend implements ExecutionBackend {
  constructor(
    private readonly runtimeRoot: string,
    private readonly logger: AppLogger,
    private readonly progressReporter: DeploymentProgressReporter,
    private readonly integrationAuthPort?: IntegrationAuthPort,
    private readonly edgeProxyProviderRegistry?: EdgeProxyProviderRegistry,
  ) {}

  private report(
    context: ExecutionContext,
    input: {
      deploymentId: string;
      phase: LogPhase;
      message: string;
      level?: LogLevel;
      source?: LogSource;
      status?: "running" | "succeeded" | "failed";
      stream?: "stdout" | "stderr";
    },
  ): void {
    reportDeploymentProgress(this.progressReporter, context, {
      deploymentId: input.deploymentId,
      phase: input.phase,
      message: input.message,
      ...(input.level ? { level: input.level } : {}),
      ...(input.source ? { source: input.source } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.stream ? { stream: input.stream } : {}),
      step: deploymentProgressSteps[input.phase],
    });
  }

  private pushOutputLog(
    logs: DeploymentLogEntry[],
    input: {
      context: ExecutionContext;
      deploymentId: string;
      phase: LogPhase;
      line: string;
      level: LogLevel;
      stream: "stdout" | "stderr";
      persistedCount: number;
    },
  ): number {
    this.report(input.context, {
      deploymentId: input.deploymentId,
      phase: input.phase,
      source: "application",
      level: input.level,
      message: input.line,
      stream: input.stream,
    });

    if (input.persistedCount >= persistedOutputLineLimit) {
      return input.persistedCount;
    }

    logs.push(phaseLog(input.phase, input.line, input.level, "application"));
    return input.persistedCount + 1;
  }

  private pushCommandOutput(
    logs: DeploymentLogEntry[],
    input: {
      context: ExecutionContext;
      deploymentId: string;
      phase: LogPhase;
      output: string;
      level: LogLevel;
      stream: "stdout" | "stderr";
      redactions?: readonly string[];
    },
  ): void {
    let persistedCount = 0;

    for (const line of redactSecrets(input.output, input.redactions)
      .split(/\r?\n/)
      .map((outputLine) => outputLine.trim())
      .filter((outputLine) => outputLine.length > 0)) {
      persistedCount = this.pushOutputLog(logs, {
        context: input.context,
        deploymentId: input.deploymentId,
        phase: input.phase,
        line,
        level: classifyOutputLogLevel(line, input.level),
        stream: input.stream,
        persistedCount,
      });
    }
  }

  private applyFailure(
    deployment: Deployment,
    input: {
      logs: DeploymentLogEntry[];
      errorCode: string;
      retryable?: boolean;
      metadata?: Record<string, string>;
    },
  ): { deployment: Deployment } {
    deployment.applyExecutionResult(FinishedAt.rehydrate(new Date().toISOString()), ExecutionResult.rehydrate({
      exitCode: ExitCode.rehydrate(1),
      status: ExecutionStatusValue.rehydrate("failed"),
      logs: input.logs,
      retryable: input.retryable ?? false,
      errorCode: ErrorCodeText.rehydrate(input.errorCode),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    }));

    return { deployment };
  }

  private pushDockerContainerDiagnostics(
    logs: DeploymentLogEntry[],
    input: {
      context: ExecutionContext;
      deploymentId: string;
      workdir: string;
      env: NodeJS.ProcessEnv;
      containerName: string;
    },
  ): void {
    const format =
      "status={{.State.Status}} exitCode={{.State.ExitCode}} error={{.State.Error}} oomKilled={{.State.OOMKilled}} finishedAt={{.State.FinishedAt}}";
    const inspectMessage = `Inspect Docker container ${input.containerName}`;
    logs.push(phaseLog("verify", inspectMessage));
    this.report(input.context, {
      deploymentId: input.deploymentId,
      phase: "verify",
      status: "running",
      message: inspectMessage,
    });

    const inspect = runSyncCommand({
      command: `docker inspect --format ${shellQuote(format)} ${shellQuote(input.containerName)}`,
      cwd: input.workdir,
      env: input.env,
    });
    this.pushCommandOutput(logs, {
      context: input.context,
      deploymentId: input.deploymentId,
      phase: "verify",
      output: inspect.stdout,
      level: inspect.failed ? "warn" : "info",
      stream: "stdout",
    });
    this.pushCommandOutput(logs, {
      context: input.context,
      deploymentId: input.deploymentId,
      phase: "verify",
      output: inspect.stderr,
      level: "warn",
      stream: "stderr",
    });

    const logsMessage = `Capture Docker logs for ${input.containerName}`;
    logs.push(phaseLog("verify", logsMessage));
    this.report(input.context, {
      deploymentId: input.deploymentId,
      phase: "verify",
      status: "running",
      message: logsMessage,
    });

    const dockerLogs = runSyncCommand({
      command: `docker logs --tail 50 ${shellQuote(input.containerName)}`,
      cwd: input.workdir,
      env: input.env,
    });
    this.pushCommandOutput(logs, {
      context: input.context,
      deploymentId: input.deploymentId,
      phase: "verify",
      output: dockerLogs.stdout,
      level: "info",
      stream: "stdout",
    });
    this.pushCommandOutput(logs, {
      context: input.context,
      deploymentId: input.deploymentId,
      phase: "verify",
      output: dockerLogs.stderr,
      level: dockerLogs.failed ? "warn" : "info",
      stream: "stderr",
    });

    if (inspect.failed && !inspect.stdout && !inspect.stderr) {
      logs.push(
        phaseLog(
          "verify",
          `Docker inspect did not return diagnostics for ${input.containerName}`,
          "warn",
        ),
      );
    }

    if (dockerLogs.failed && !dockerLogs.stdout && !dockerLogs.stderr) {
      logs.push(
        phaseLog(
          "verify",
          `Docker logs did not return application output for ${input.containerName}`,
          "warn",
        ),
      );
    }
  }

  private runtimeDirectory(deploymentId: string): string {
    return resolve(this.runtimeRoot, "local-deployments", deploymentId);
  }

  private async prepareLocalSource(
    context: ExecutionContext,
    deployment: Deployment,
    logs: DeploymentLogEntry[],
    input: {
      runtimeDir: string;
      env: NodeJS.ProcessEnv;
      fallbackWorkdir: string;
    },
  ): Promise<
    | {
        prepared: true;
        workdir: string;
        metadata: Record<string, string>;
      }
    | {
        prepared: false;
        deployment: Deployment;
      }
  > {
    const state = deployment.toState();
    const source = state.runtimePlan.source;

    if (state.runtimePlan.buildStrategy === "prebuilt-image" || source.kind === "docker-image") {
      mkdirSync(input.runtimeDir, { recursive: true });
      return {
        prepared: true,
        workdir: input.runtimeDir,
        metadata: {
          sourceStrategy: "prebuilt-image",
        },
      };
    }

    if (source.kind === "dockerfile-inline" || source.kind === "docker-compose-inline") {
      const content = source.metadata?.content;
      if (!content) {
        const message = `${source.kind} source requires inline content metadata`;
        logs.push(phaseLog("package", message, "error"));
        return {
          prepared: false,
          deployment: this.applyFailure(deployment, {
            logs,
            errorCode: "inline_source_content_missing",
            retryable: false,
            metadata: {
              source: source.locator,
              sourceKind: source.kind,
            },
          }).deployment,
        };
      }

      const workdir = resolve(input.runtimeDir, "source");
      const targetFile =
        source.kind === "dockerfile-inline"
          ? (source.metadata?.dockerfilePath ?? "Dockerfile")
          : (source.metadata?.composeFilePath ?? "docker-compose.yml");
      mkdirSync(resolve(workdir, dirname(targetFile)), { recursive: true });
      await Bun.write(resolve(workdir, targetFile), content);

      return {
        prepared: true,
        workdir,
        metadata: {
          sourceStrategy: source.kind,
          sourceDir: workdir,
        },
      };
    }

    if (!isRemoteGitSourceKind(source.kind)) {
      return {
        prepared: true,
        workdir: sourceWorkdir(input.fallbackWorkdir, source.metadata),
        metadata: {
          sourceStrategy: "local-workspace",
          ...(source.metadata?.baseDirectory
            ? { baseDirectory: source.metadata.baseDirectory }
            : {}),
        },
      };
    }

    const sourceDir = resolve(input.runtimeDir, "source");
    mkdirSync(input.runtimeDir, { recursive: true });
    rmSync(sourceDir, { recursive: true, force: true });

    const accessToken = source.kind === "git-github-app" && isGitHubHttpsLocator(source.locator)
      ? await this.integrationAuthPort?.getProviderAccessToken(context, "github")
      : null;
    const cloneLocator = accessToken
      ? withGitHubAccessToken(source.locator, accessToken)
      : source.locator;

    logs.push(phaseLog("package", `Clone remote git source into ${sourceDir}`));
    this.report(context, {
      deploymentId: state.id.value,
      phase: "package",
      status: "running",
      message: `Clone remote git source ${source.displayName}`,
    });

    const cloneArgs = [
      "clone",
      "--depth",
      "1",
      ...(source.metadata?.gitRef ? ["--branch", source.metadata.gitRef] : []),
      cloneLocator,
      sourceDir,
    ];
    const clone = runSyncProcess({
      command: "git",
      args: cloneArgs,
      cwd: input.runtimeDir,
      env: input.env,
      redactions: accessToken ? [accessToken, cloneLocator] : [cloneLocator],
    });
    this.pushCommandOutput(logs, {
      context,
      deploymentId: state.id.value,
      phase: "package",
      output: clone.stdout,
      level: "info",
      stream: "stdout",
      redactions: accessToken ? [accessToken, cloneLocator] : [cloneLocator],
    });
    this.pushCommandOutput(logs, {
      context,
      deploymentId: state.id.value,
      phase: "package",
      output: clone.stderr,
      level: "warn",
      stream: "stderr",
      redactions: accessToken ? [accessToken, cloneLocator] : [cloneLocator],
    });

    if (clone.failed) {
      const message = clone.reason
        ? `Remote git clone failed: ${clone.reason}`
        : `Remote git clone failed with exit code ${clone.exitCode}`;
      logs.push(phaseLog("package", message, "error"));
      this.report(context, {
        deploymentId: state.id.value,
        phase: "package",
        status: "failed",
        level: "error",
        message,
      });

      return {
        prepared: false,
        deployment: this.applyFailure(deployment, {
          logs,
          errorCode: "remote_git_clone_failed",
          retryable: true,
          metadata: {
            source: source.locator,
            sourceDir,
          },
        }).deployment,
      };
    }

    this.report(context, {
      deploymentId: state.id.value,
      phase: "package",
      status: "succeeded",
      message: "Remote git source is ready",
    });

    return {
      prepared: true,
      workdir: sourceWorkdir(sourceDir, source.metadata),
      metadata: {
        sourceStrategy: "remote-git",
        sourceDir,
        ...(source.metadata?.gitRef ? { gitRef: source.metadata.gitRef } : {}),
        ...(source.metadata?.baseDirectory ? { baseDirectory: source.metadata.baseDirectory } : {}),
      },
    };
  }

  private async executeHostProcess(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    const state = deployment.toState();
    const runtimeDir = this.runtimeDirectory(state.id.value);
    const logPath = resolve(runtimeDir, "app.log");
    mkdirSync(runtimeDir, { recursive: true });

    const port = await reservePort(state.runtimePlan.execution.port);
    const env = deploymentEnv(deployment, port);
    const logs: DeploymentLogEntry[] = [
      phaseLog("plan", "Using local host-process execution"),
    ];
    const preparedSource = await this.prepareLocalSource(context, deployment, logs, {
      runtimeDir,
      env,
      fallbackWorkdir:
        state.runtimePlan.execution.workingDirectory ?? normalizeWorkingDirectory(state.runtimePlan.source.locator),
    });

    if (!preparedSource.prepared) {
      return ok({ deployment: preparedSource.deployment });
    }

    const workdir = preparedSource.workdir;
    logs.push(phaseLog("plan", `Host process working directory: ${workdir}`));
    const hasWorkspacePreparation = Boolean(
      state.runtimePlan.execution.installCommand || state.runtimePlan.execution.buildCommand,
    );

    const maybeRun = async (
      phase: LogPhase,
      command: string | undefined,
      label: string,
    ): Promise<boolean> => {
      if (!command) {
        return true;
      }

      logs.push(phaseLog(phase, `${label}: ${command}`));
      this.report(context, {
        deploymentId: state.id.value,
        phase,
        status: "running",
        message: `${label}: ${command}`,
      });
      let persistedCount = 0;
      const result = await runStreamingCommand({
        command,
        cwd: workdir,
        env,
        onOutput: (line, level, stream) => {
          persistedCount = this.pushOutputLog(logs, {
            context,
            deploymentId: state.id.value,
            phase,
            line,
            level,
            stream,
            persistedCount,
          });
        },
      });
      void result.stdout;
      void result.stderr;

      if (!result.failed) {
        this.report(context, {
          deploymentId: state.id.value,
          phase,
          status: "succeeded",
          message: `${label} completed`,
        });
        return true;
      }

      const message =
        result.reason
          ? `${label} failed: ${result.reason}`
          : `${label} failed with exit code ${result.exitCode}`;
      logs.push(phaseLog(phase, message, "error"));
      this.report(context, {
        deploymentId: state.id.value,
        phase,
        status: "failed",
        level: "error",
        message,
      });
      return false;
    };

    if (!(await maybeRun("package", state.runtimePlan.execution.installCommand, "Install command"))) {
      return ok({
        deployment: this.applyFailure(deployment, {
          logs,
          errorCode: "local_install_failed",
          metadata: {
            workdir,
          },
        }).deployment,
      });
    }

    if (!(await maybeRun("package", state.runtimePlan.execution.buildCommand, "Build command"))) {
      return ok({
        deployment: this.applyFailure(deployment, {
          logs,
          errorCode: "local_build_failed",
          metadata: {
            workdir,
          },
        }).deployment,
      });
    }

    if (!hasWorkspacePreparation) {
      this.report(context, {
        deploymentId: state.id.value,
        phase: "package",
        status: "succeeded",
        message: "No workspace install/build commands configured",
      });
    }

    const startCommand = state.runtimePlan.execution.startCommand;
    if (!startCommand) {
      const message = "Start command is required for host-process execution";
      this.report(context, {
        deploymentId: state.id.value,
        phase: "deploy",
        status: "failed",
        level: "error",
        message,
      });
      return ok({
        deployment: this.applyFailure(deployment, {
          logs: [
            ...logs,
            phaseLog("deploy", message, "error"),
          ],
          errorCode: "missing_start_command",
          metadata: {
            workdir,
          },
        }).deployment,
      });
    }

    logs.push(phaseLog("deploy", `Start command: ${startCommand}`));
    this.report(context, {
      deploymentId: state.id.value,
      phase: "deploy",
      status: "running",
      message: `Start command: ${startCommand}`,
    });
    const logTailer = new AppLogTailer(logPath, (line) => {
      const persistedCount = logs.filter(
        (log) => log.source === "application" && log.phase === "deploy",
      ).length;
      this.pushOutputLog(logs, {
        context,
        deploymentId: state.id.value,
        phase: "deploy",
        line,
        level: "info",
        stream: "stdout",
        persistedCount,
      });
    });
    logTailer.start();
    const stdoutFd = openSync(logPath, "a");
    const stderrFd = openSync(logPath, "a");
    const child = spawn(startCommand, {
      cwd: workdir,
      env,
      shell: true,
      detached: true,
      stdio: ["ignore", stdoutFd, stderrFd],
    });
    closeSync(stdoutFd);
    closeSync(stderrFd);
    child.unref();

    this.report(context, {
      deploymentId: state.id.value,
      phase: "deploy",
      status: "succeeded",
      message: `Started process ${child.pid}`,
    });

    const healthPath = state.runtimePlan.execution.healthCheckPath ?? "/";
    const url = `http://127.0.0.1:${port}${healthPath}`;
    const healthOptions = httpHealthCheckOptions(state.runtimePlan.execution);
    if (!healthOptions) {
      logTailer.stop();
      this.report(context, {
        deploymentId: state.id.value,
        phase: "verify",
        status: "succeeded",
        message: "Health check disabled for resource",
      });
      logs.push(phaseLog("verify", "Health check disabled for resource"));
      deployment.applyExecutionResult(
        FinishedAt.rehydrate(new Date().toISOString()),
        ExecutionResult.rehydrate({
          exitCode: ExitCode.rehydrate(0),
          status: ExecutionStatusValue.rehydrate("succeeded"),
          retryable: false,
          logs,
          metadata: {
            workdir,
            port: String(port),
            pid: String(child.pid),
            logPath,
            ...preparedSource.metadata,
          },
        }),
      );
      return ok({ deployment });
    }
    this.report(context, {
      deploymentId: state.id.value,
      phase: "verify",
      status: "running",
      message: `Checking ${url}`,
    });
    const health = await waitForHealth(url, healthOptions);
    logTailer.stop();

    if (!health.ok) {
      killProcess(String(child.pid));
      const message = `Health check failed for ${url}${health.reason ? `: ${health.reason}` : ""}`;
      this.report(context, {
        deploymentId: state.id.value,
        phase: "verify",
        status: "failed",
        level: "error",
        message,
      });
      return ok({
        deployment: this.applyFailure(deployment, {
          logs: [
            ...logs,
            phaseLog("verify", message, "error"),
          ],
          errorCode: "local_health_check_failed",
          retryable: true,
          metadata: {
            workdir,
            logPath,
            pid: String(child.pid),
            port: String(port),
            url,
          },
        }).deployment,
      });
    }

    const message = `Application is reachable at ${url}`;
    logs.push(phaseLog("verify", message));
    this.report(context, {
      deploymentId: state.id.value,
      phase: "verify",
      status: "succeeded",
      message,
    });
    deployment.applyExecutionResult(FinishedAt.rehydrate(new Date().toISOString()), ExecutionResult.rehydrate({
      exitCode: ExitCode.rehydrate(0),
      status: ExecutionStatusValue.rehydrate("succeeded"),
      retryable: false,
      logs,
      metadata: {
        workdir,
        logPath,
        pid: String(child.pid),
        port: String(port),
        url,
        ...preparedSource.metadata,
      },
    }));
    return ok({ deployment });
  }

  private async executeDockerContainer(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    const state = deployment.toState();
    const runtimeDir = this.runtimeDirectory(state.id.value);
    const port = await reservePort(state.runtimePlan.execution.port);
    const env = deploymentEnv(deployment, port);
    const logs: DeploymentLogEntry[] = [
      phaseLog("plan", "Using local docker-container execution"),
    ];
    const preparedSource = await this.prepareLocalSource(context, deployment, logs, {
      runtimeDir,
      env,
      fallbackWorkdir:
        state.runtimePlan.execution.workingDirectory ?? normalizeWorkingDirectory(state.runtimePlan.source.locator),
    });

    if (!preparedSource.prepared) {
      return ok({ deployment: preparedSource.deployment });
    }

    const workdir = preparedSource.workdir;
    logs.push(phaseLog("plan", `Docker working directory: ${workdir}`));
    this.report(context, {
      deploymentId: state.id.value,
      phase: "package",
      status: "running",
      message: "Prepare Docker container deployment",
    });

    const dockerVersion = runSyncCommand({
      command: "docker version --format '{{.Server.Version}}'",
      cwd: workdir,
      env,
    });

    if (dockerVersion.failed) {
      const message = "Docker is not available on the local machine";
      this.report(context, {
        deploymentId: state.id.value,
        phase: "package",
        status: "failed",
        level: "error",
        message,
      });
      return ok({
        deployment: this.applyFailure(deployment, {
          logs: [
            ...logs,
            phaseLog("deploy", message, "error"),
          ],
          errorCode: "docker_unavailable",
          retryable: false,
        }).deployment,
      });
    }

    let image = state.runtimePlan.execution.image;
    const containerName = sanitizeName(`appaloft-${state.id.value}`);

    if (state.runtimePlan.buildStrategy === "dockerfile" || state.runtimePlan.buildStrategy === "workspace-commands") {
      image = sanitizeName(`appaloft-image-${state.id.value}`);
      const dockerfilePath =
        state.runtimePlan.buildStrategy === "workspace-commands"
          ? resolve(runtimeDir, state.runtimePlan.execution.dockerfilePath ?? "Dockerfile.appaloft")
          : state.runtimePlan.execution.dockerfilePath ?? "Dockerfile";

      if (state.runtimePlan.buildStrategy === "workspace-commands") {
        const dockerfile = generateWorkspaceDockerfile({
          execution: state.runtimePlan.execution,
          ...(state.runtimePlan.source.inspection
            ? { sourceInspection: state.runtimePlan.source.inspection }
            : {}),
        });
        if (!dockerfile) {
          const message = "Start command is required for workspace image generation";
          this.report(context, {
            deploymentId: state.id.value,
            phase: "package",
            status: "failed",
            level: "error",
            message,
          });
          return ok({
            deployment: this.applyFailure(deployment, {
              logs: [
                ...logs,
                phaseLog("package", message, "error"),
              ],
              errorCode: "workspace_start_command_missing",
              retryable: false,
            }).deployment,
          });
        }
        mkdirSync(runtimeDir, { recursive: true });
        await Bun.write(dockerfilePath, dockerfile);
        logs.push(phaseLog("package", `Generated workspace Dockerfile at ${dockerfilePath}`));
      }

      const buildCommand = renderRuntimeCommandString(
        RuntimeCommandBuilder.docker().buildImage({
          image,
          dockerfilePath,
          contextPath: workdir,
        }),
        { quote: shellQuote },
      );
      logs.push(phaseLog("package", buildCommand));
      this.report(context, {
        deploymentId: state.id.value,
        phase: "package",
        status: "running",
        message: `Build image ${image}`,
      });
      const build = runSyncCommand({
        command: buildCommand,
        cwd: workdir,
        env,
      });
      this.pushCommandOutput(logs, {
        context,
        deploymentId: state.id.value,
        phase: "package",
        output: build.stdout,
        level: "info",
        stream: "stdout",
      });
      this.pushCommandOutput(logs, {
        context,
        deploymentId: state.id.value,
        phase: "package",
        output: build.stderr,
        level: "warn",
        stream: "stderr",
      });

      if (build.failed || !image) {
        const message = "Docker image build failed";
        this.report(context, {
          deploymentId: state.id.value,
          phase: "package",
          status: "failed",
          level: "error",
          message,
        });
        return ok({
          deployment: this.applyFailure(deployment, {
            logs: [
              ...logs,
              phaseLog("package", message, "error"),
            ],
            errorCode: "docker_build_failed",
            retryable: true,
          }).deployment,
        });
      }
    }

    if (!image) {
      const message = "Docker image is required for docker execution";
      this.report(context, {
        deploymentId: state.id.value,
        phase: "package",
        status: "failed",
        level: "error",
        message,
      });
      return ok({
        deployment: this.applyFailure(deployment, {
          logs: [
            ...logs,
            phaseLog("package", message, "error"),
          ],
          errorCode: "missing_docker_image",
        }).deployment,
      });
    }

    this.report(context, {
      deploymentId: state.id.value,
      phase: "package",
      status: "succeeded",
      message: "Docker package is ready",
    });

    const accessRoutes = state.runtimePlan.execution.accessRoutes ?? [];
    const proxyBootstrapResult = this.edgeProxyProviderRegistry
      ? await createEdgeProxyEnsurePlan({
          providerRegistry: this.edgeProxyProviderRegistry,
          context: {
            correlationId: context.requestId,
          },
          accessRoutes,
          options: proxyBootstrapOptionsFromEnv(env),
        })
      : ok(null);
    if (proxyBootstrapResult.isErr()) {
      const message = "Edge proxy provider could not render an ensure plan";
      logs.push(phaseLog("deploy", message, "error"));
      return ok({
        deployment: this.applyFailure(deployment, {
          logs,
          errorCode: proxyBootstrapResult.error.code,
          retryable: proxyBootstrapResult.error.retryable,
          metadata: {
            message: proxyBootstrapResult.error.message,
          },
        }).deployment,
      });
    }

    const proxyBootstrap = proxyBootstrapResult.value;
    if (proxyBootstrap) {
      const proxyMessage = `Ensure ${proxyBootstrap.displayName} edge proxy on Docker network ${proxyBootstrap.networkName}`;
      logs.push(phaseLog("deploy", proxyMessage));
      this.report(context, {
        deploymentId: state.id.value,
        phase: "deploy",
        status: "running",
        message: proxyMessage,
      });

      const network = runSyncCommand({
        command: proxyBootstrap.networkCommand,
        cwd: workdir,
        env,
      });
      this.pushCommandOutput(logs, {
        context,
        deploymentId: state.id.value,
        phase: "deploy",
        output: network.stdout,
        level: "info",
        stream: "stdout",
      });
      this.pushCommandOutput(logs, {
        context,
        deploymentId: state.id.value,
        phase: "deploy",
        output: network.stderr,
        level: "warn",
        stream: "stderr",
      });

      const proxy = runSyncCommand({
        command: proxyBootstrap.containerCommand,
        cwd: workdir,
        env,
      });
      this.pushCommandOutput(logs, {
        context,
        deploymentId: state.id.value,
        phase: "deploy",
        output: proxy.stdout,
        level: "info",
        stream: "stdout",
      });
      this.pushCommandOutput(logs, {
        context,
        deploymentId: state.id.value,
        phase: "deploy",
        output: proxy.stderr,
        level: "warn",
        stream: "stderr",
      });

      if (network.failed || proxy.failed) {
        const message = `${proxyBootstrap.displayName} edge proxy failed to start`;
        this.report(context, {
          deploymentId: state.id.value,
          phase: "deploy",
          status: "failed",
          level: "error",
          message,
        });
        return ok({
          deployment: this.applyFailure(deployment, {
            logs: [
              ...logs,
              phaseLog("deploy", message, "error"),
            ],
            errorCode: "edge_proxy_start_failed",
            retryable: true,
            metadata: {
              proxyKind: proxyBootstrap.proxyKind,
              providerKey: proxyBootstrap.providerKey,
              containerName: proxyBootstrap.containerName,
              networkName: proxyBootstrap.networkName,
            },
          }).deployment,
        });
      }

      const readyMessage = `${proxyBootstrap.displayName} edge proxy is ready`;
      logs.push(phaseLog("deploy", readyMessage));
      this.report(context, {
        deploymentId: state.id.value,
        phase: "deploy",
        status: "succeeded",
        message: readyMessage,
      });
    }

    const dockerCommandBuilder = RuntimeCommandBuilder.docker();
    runSyncCommand({
      command: renderRuntimeCommandString(
        dockerCommandBuilder.removeContainer({
          containerName,
          ignoreMissing: true,
        }),
        { quote: shellQuote },
      ),
      cwd: workdir,
      env,
    });
    runSyncCommand({
      command: renderRuntimeCommandString(
        dockerCommandBuilder.removeResourceContainers({
          resourceId: state.resourceId.value,
          currentContainerName: containerName,
        }),
        { quote: shellQuote },
      ),
      cwd: workdir,
      env,
    });
    logs.push(
      phaseLog("deploy", `Release existing containers for resource ${state.resourceId.value}`),
    );

    const proxyRoutePlanResult = this.edgeProxyProviderRegistry
      ? await createProxyRouteRealizationPlan({
          providerRegistry: this.edgeProxyProviderRegistry,
          context: {
            correlationId: context.requestId,
          },
          deploymentId: state.id.value,
          port,
          accessRoutes,
        })
      : ok(null);
    if (proxyRoutePlanResult.isErr()) {
      const message = "Edge proxy route configuration could not be rendered";
      logs.push(phaseLog("deploy", message, "error"));
      return ok({
        deployment: this.applyFailure(deployment, {
          logs,
          errorCode: proxyRoutePlanResult.error.code,
          retryable: proxyRoutePlanResult.error.retryable,
          metadata: {
            message: proxyRoutePlanResult.error.message,
            phase: "proxy-route-realization",
          },
        }).deployment,
      });
    }

    const dockerEnvVariables = Object.entries(env)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .filter(([key]) =>
        key === "PORT" ||
        key.startsWith("APPALOFT_") ||
        state.environmentSnapshot.variables.some((variable) => variable.key === key),
      )
      .map(([name, value]) => {
        const snapshotVariable = state.environmentSnapshot.variables.find(
          (variable) => variable.key === name,
        );
        return {
          name,
          value,
          ...(snapshotVariable?.isSecret ? { redacted: true } : {}),
        };
      });
    const labels = dockerLabelsFromAssignments([
      ...appaloftDockerContainerLabels({
        deploymentId: state.id.value,
        projectId: state.projectId.value,
        environmentId: state.environmentId.value,
        resourceId: state.resourceId.value,
        destinationId: state.destinationId.value,
      }),
      ...(proxyRoutePlanResult.value?.labels ?? []),
    ]);
    const runCommandSpec = dockerCommandBuilder.runContainer({
      image,
      containerName,
      env: dockerEnvVariables,
      labels,
      ...(proxyRoutePlanResult.value?.networkName
        ? { networkName: proxyRoutePlanResult.value.networkName }
        : {}),
      publishedPorts: [
        dockerCommandBuilder.publishPort({
          containerPort: port,
          mode:
            state.runtimePlan.execution.metadata?.["resource.exposureMode"] === "direct-port"
              ? "host-same-port"
              : "loopback-ephemeral",
        }),
      ],
    });
    const runCommand = renderRuntimeCommandString(runCommandSpec, { quote: shellQuote });
    logs.push(
      phaseLog(
        "deploy",
        renderRuntimeCommandString(runCommandSpec, { quote: shellQuote, mode: "display" }),
      ),
    );
    this.report(context, {
      deploymentId: state.id.value,
      phase: "deploy",
      status: "running",
      message: `Start container ${containerName}`,
    });
    const run = runSyncCommand({
      command: runCommand,
      cwd: workdir,
      env,
    });
    this.pushCommandOutput(logs, {
      context,
      deploymentId: state.id.value,
      phase: "deploy",
      output: run.stdout,
      level: "info",
      stream: "stdout",
    });
    this.pushCommandOutput(logs, {
      context,
      deploymentId: state.id.value,
      phase: "deploy",
      output: run.stderr,
      level: "warn",
      stream: "stderr",
    });

    if (run.failed) {
      const message = "Docker container failed to start";
      this.report(context, {
        deploymentId: state.id.value,
        phase: "deploy",
        status: "failed",
        level: "error",
        message,
      });
      return ok({
        deployment: this.applyFailure(deployment, {
          logs: [
            ...logs,
            phaseLog("deploy", message, "error"),
          ],
          errorCode: "docker_run_failed",
          retryable: true,
          metadata: {
            image,
            containerName,
            port: String(port),
            ...preparedSource.metadata,
          },
        }).deployment,
      });
    }
    this.report(context, {
      deploymentId: state.id.value,
      phase: "deploy",
      status: "succeeded",
      message: `Container ${containerName} started`,
    });

    const proxyReloadPlanResult = this.edgeProxyProviderRegistry
      ? await createProxyReloadPlan({
          providerRegistry: this.edgeProxyProviderRegistry,
          context: {
            correlationId: context.requestId,
          },
          deploymentId: state.id.value,
          accessRoutes,
          routePlan: proxyRoutePlanResult.value,
          reason: "route-realization",
        })
      : ok(null);
    if (proxyReloadPlanResult.isErr()) {
      const message = "Edge proxy reload plan could not be rendered";
      logs.push(phaseLog("deploy", message, "error"));
      return ok({
        deployment: this.applyFailure(deployment, {
          logs,
          errorCode: proxyReloadPlanResult.error.code,
          retryable: proxyReloadPlanResult.error.retryable,
          metadata: {
            message: proxyReloadPlanResult.error.message,
            phase: "proxy-reload",
          },
        }).deployment,
      });
    }

    const proxyReloadPlan = proxyReloadPlanResult.value;
    if (proxyReloadPlan?.required) {
      this.report(context, {
        deploymentId: state.id.value,
        phase: "deploy",
        status: "running",
        message: `Reload ${proxyReloadPlan.displayName} edge proxy`,
      });
      const reload = executeProxyReloadPlan({
        plan: proxyReloadPlan,
        runCommand: (step) =>
          runSyncCommand({
            command: step.command ?? "",
            cwd: workdir,
            env,
          }),
      });

      for (const entry of reload.logs) {
        logs.push(phaseLog("deploy", entry.message, entry.stderr ? "warn" : "info"));
        this.pushCommandOutput(logs, {
          context,
          deploymentId: state.id.value,
          phase: "deploy",
          output: entry.stdout ?? "",
          level: "info",
          stream: "stdout",
        });
        this.pushCommandOutput(logs, {
          context,
          deploymentId: state.id.value,
          phase: "deploy",
          output: entry.stderr ?? "",
          level: "warn",
          stream: "stderr",
        });
      }

      if (reload.status === "failed") {
        this.report(context, {
          deploymentId: state.id.value,
          phase: "deploy",
          status: "failed",
          level: "error",
          message: reload.message,
        });
        return ok({
          deployment: this.applyFailure(deployment, {
            logs: [
              ...logs,
              phaseLog("deploy", reload.message, "error"),
            ],
            errorCode: reload.errorCode,
            retryable: reload.retryable,
            metadata: {
              providerKey: proxyReloadPlan.providerKey,
              proxyKind: proxyReloadPlan.proxyKind,
              stepName: reload.stepName,
              phase: "proxy-reload",
            },
          }).deployment,
        });
      }

      this.report(context, {
        deploymentId: state.id.value,
        phase: "deploy",
        status: "succeeded",
        message: `${proxyReloadPlan.displayName} edge proxy reload is complete`,
      });
    }

    const healthPath = state.runtimePlan.execution.healthCheckPath ?? "/";
    const publishedPortResult = runSyncCommand({
      command: dockerPublishedPortCommand({
        containerName,
        containerPort: port,
        quote: shellQuote,
      }),
      cwd: workdir,
      env,
    });
    const publishedHostPort = parseDockerPublishedHostPort(publishedPortResult.stdout);

    if (publishedPortResult.failed || publishedHostPort === undefined) {
      this.pushDockerContainerDiagnostics(logs, {
        context,
        deploymentId: state.id.value,
        workdir,
        env,
        containerName,
      });
      runSyncCommand({
        command: `docker rm -f ${containerName}`,
        cwd: workdir,
        env,
      });
      const message = `Docker published port could not be resolved for ${containerName}`;
      this.report(context, {
        deploymentId: state.id.value,
        phase: "verify",
        status: "failed",
        level: "error",
        message,
      });
      return ok({
        deployment: this.applyFailure(deployment, {
          logs: [
            ...logs,
            phaseLog("verify", message, "error"),
          ],
          errorCode: "docker_published_port_resolution_failed",
          retryable: true,
          metadata: {
            image,
            containerName,
            port: String(port),
            ...preparedSource.metadata,
          },
        }).deployment,
      });
    }

    const url = `http://127.0.0.1:${publishedHostPort}${healthPath}`;
    const healthOptions = httpHealthCheckOptions(state.runtimePlan.execution);
    if (!healthOptions) {
      this.report(context, {
        deploymentId: state.id.value,
        phase: "verify",
        status: "succeeded",
        message: "Health check disabled for resource",
      });
      logs.push(phaseLog("verify", "Health check disabled for resource"));
      deployment.applyExecutionResult(
        FinishedAt.rehydrate(new Date().toISOString()),
        ExecutionResult.rehydrate({
          exitCode: ExitCode.rehydrate(0),
          status: ExecutionStatusValue.rehydrate("succeeded"),
          retryable: false,
          logs,
          metadata: {
            image,
            containerName,
            port: String(port),
            publishedPort: String(publishedHostPort),
            ...preparedSource.metadata,
          },
        }),
      );
      return ok({ deployment });
    }
    this.report(context, {
      deploymentId: state.id.value,
      phase: "verify",
      status: "running",
      message: `Checking ${url}`,
    });
    const health = await waitForHealth(url, healthOptions);

    if (!health.ok) {
      this.pushDockerContainerDiagnostics(logs, {
        context,
        deploymentId: state.id.value,
        workdir,
        env,
        containerName,
      });
      runSyncCommand({
        command: `docker rm -f ${containerName}`,
        cwd: workdir,
        env,
      });
      const message = `Container health check failed for ${url}${health.reason ? `: ${health.reason}` : ""}`;
      this.report(context, {
        deploymentId: state.id.value,
        phase: "verify",
        status: "failed",
        level: "error",
        message,
      });
      return ok({
        deployment: this.applyFailure(deployment, {
          logs: [
            ...logs,
            phaseLog("verify", message, "error"),
          ],
          errorCode: "docker_health_check_failed",
          retryable: true,
          metadata: {
            image,
            containerName,
            port: String(port),
            publishedPort: String(publishedHostPort),
            url,
            ...preparedSource.metadata,
          },
        }).deployment,
      });
    }

    const message = `Container is reachable at ${url}`;
    logs.push(phaseLog("verify", message));
    this.report(context, {
      deploymentId: state.id.value,
      phase: "verify",
      status: "succeeded",
      message,
    });
    deployment.applyExecutionResult(FinishedAt.rehydrate(new Date().toISOString()), ExecutionResult.rehydrate({
      exitCode: ExitCode.rehydrate(0),
      status: ExecutionStatusValue.rehydrate("succeeded"),
      retryable: false,
      logs,
      metadata: {
        image,
        containerName,
        port: String(port),
        publishedPort: String(publishedHostPort),
        url,
        ...preparedSource.metadata,
      },
    }));
    return ok({ deployment });
  }

  private async executeDockerCompose(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    const state = deployment.toState();
    const runtimeDir = this.runtimeDirectory(state.id.value);
    const env = deploymentEnv(deployment, state.runtimePlan.execution.port);
    const logs: DeploymentLogEntry[] = [
      phaseLog("plan", "Using local docker-compose-stack execution"),
    ];
    const preparedSource = await this.prepareLocalSource(context, deployment, logs, {
      runtimeDir,
      env,
      fallbackWorkdir:
        state.runtimePlan.execution.workingDirectory ?? normalizeWorkingDirectory(state.runtimePlan.source.locator),
    });

    if (!preparedSource.prepared) {
      return ok({ deployment: preparedSource.deployment });
    }

    const workdir = preparedSource.workdir;
    const composeFile =
      isRemoteGitSourceKind(state.runtimePlan.source.kind) &&
      (!state.runtimePlan.execution.composeFile ||
        state.runtimePlan.execution.composeFile === state.runtimePlan.source.locator)
        ? resolve(workdir, "docker-compose.yml")
        : (state.runtimePlan.execution.composeFile ?? state.runtimePlan.source.locator);
    logs.push(phaseLog("plan", `Compose working directory: ${workdir}`));
    const upCommand = renderRuntimeCommandString(
      RuntimeCommandBuilder.docker().composeUp({
        composeFile,
      }),
      { quote: shellQuote },
    );
    logs.push(phaseLog("deploy", upCommand));
    this.report(context, {
      deploymentId: state.id.value,
      phase: "deploy",
      status: "running",
      message: `Start compose stack ${composeFile}`,
    });

    const up = runSyncCommand({
      command: upCommand,
      cwd: workdir,
      env,
    });
    this.pushCommandOutput(logs, {
      context,
      deploymentId: state.id.value,
      phase: "deploy",
      output: up.stdout,
      level: "info",
      stream: "stdout",
    });
    this.pushCommandOutput(logs, {
      context,
      deploymentId: state.id.value,
      phase: "deploy",
      output: up.stderr,
      level: "warn",
      stream: "stderr",
    });

    if (up.failed) {
      const message = "Docker compose deployment failed";
      this.report(context, {
        deploymentId: state.id.value,
        phase: "deploy",
        status: "failed",
        level: "error",
        message,
      });
      return ok({
        deployment: this.applyFailure(deployment, {
          logs: [
            ...logs,
            phaseLog("deploy", message, "error"),
          ],
          errorCode: "docker_compose_failed",
          retryable: true,
          metadata: {
            composeFile,
            workdir,
            ...preparedSource.metadata,
          },
        }).deployment,
      });
    }

    this.report(context, {
      deploymentId: state.id.value,
      phase: "deploy",
      status: "succeeded",
      message: "Compose stack started",
    });
    const message = "Compose stack started successfully";
    logs.push(phaseLog("verify", message));
    this.report(context, {
      deploymentId: state.id.value,
      phase: "verify",
      status: "succeeded",
      message,
    });
    deployment.applyExecutionResult(FinishedAt.rehydrate(new Date().toISOString()), ExecutionResult.rehydrate({
      exitCode: ExitCode.rehydrate(0),
      status: ExecutionStatusValue.rehydrate("succeeded"),
      retryable: false,
      logs,
      metadata: {
        composeFile,
        workdir,
        ...preparedSource.metadata,
      },
    }));
    return ok({ deployment });
  }

  async execute(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    const state = deployment.toState();
    try {
      switch (state.runtimePlan.execution.kind) {
        case "host-process":
          return await this.executeHostProcess(context, deployment);
        case "docker-container":
          return await this.executeDockerContainer(context, deployment);
        case "docker-compose-stack":
          return await this.executeDockerCompose(context, deployment);
        default:
          return err(
            domainError.validation(
              `Unsupported local execution kind: ${state.runtimePlan.execution.kind}`,
            ),
          );
      }
    } catch (error) {
      this.report(context, {
        deploymentId: state.id.value,
        phase: "deploy",
        status: "failed",
        level: "error",
        message: error instanceof Error ? error.message : "Unknown local execution error",
      });
      if (context.entrypoint !== "cli") {
        this.logger.error("local_execution_backend.execute_failed", {
          deploymentId: state.id.value,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return ok({
        deployment: this.applyFailure(deployment, {
          logs: [
            phaseLog(
              "deploy",
              error instanceof Error ? error.message : "Unknown local execution error",
              "error",
            ),
          ],
          errorCode: "local_execution_failed",
          retryable: true,
        }).deployment,
      });
    }
  }

  async cancel(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ logs: DeploymentLogEntry[] }>> {
    const state = deployment.toState();
    const metadata = state.runtimePlan.execution.metadata ?? {};
    const env = deploymentEnv(deployment);
    const workdir =
      state.runtimePlan.execution.workingDirectory ??
      normalizeWorkingDirectory(state.runtimePlan.source.locator);
    const logs: DeploymentLogEntry[] = [];

    switch (state.runtimePlan.execution.kind) {
      case "host-process":
        killProcess(metadata.pid);
        logs.push(
          phaseLog(
            "deploy",
            metadata.pid ? `Stopped process ${metadata.pid}` : "No process id recorded",
          ),
        );
        break;
      case "docker-container": {
        const containerName = metadata.containerName ?? sanitizeName(`appaloft-${state.id.value}`);
        runSyncCommand({
          command: `docker rm -f ${shellQuote(containerName)} >/dev/null 2>&1 || true`,
          cwd: workdir,
          env,
        });
        logs.push(phaseLog("deploy", `Removed container ${containerName}`));
        break;
      }
      case "docker-compose-stack":
        if (metadata.composeFile) {
          runSyncCommand({
            command: `docker compose -f ${shellQuote(metadata.composeFile)} down`,
            cwd: workdir,
            env,
          });
        }
        logs.push(
          phaseLog(
            "deploy",
            metadata.composeFile
              ? `Stopped compose stack ${metadata.composeFile}`
              : "No compose metadata recorded",
          ),
        );
        break;
    }

    this.report(context, {
      deploymentId: state.id.value,
      phase: "deploy",
      status: "succeeded",
      message: "Local deployment cancellation completed",
    });

    return ok({ logs });
  }

  async rollback(
    context: ExecutionContext,
    deployment: Deployment,
    plan: RollbackPlan,
  ): Promise<Result<{ deployment: Deployment }>> {
    void plan;
    const state = deployment.toState();
    const metadata = state.runtimePlan.execution.metadata ?? {};
    const env = deploymentEnv(deployment);
    const workdir =
      state.runtimePlan.execution.workingDirectory ?? normalizeWorkingDirectory(state.runtimePlan.source.locator);
    const logs: DeploymentLogEntry[] = [];

    try {
      this.report(context, {
        deploymentId: state.id.value,
        phase: "rollback",
        status: "running",
        message: "Apply rollback plan",
      });
      switch (state.runtimePlan.execution.kind) {
        case "host-process":
          killProcess(metadata.pid);
          logs.push(
            phaseLog(
              "rollback",
              metadata.pid ? `Stopped process ${metadata.pid}` : "No process id recorded",
            ),
          );
          break;
        case "docker-container":
          if (metadata.containerName) {
            runSyncCommand({
              command: `docker rm -f ${metadata.containerName}`,
              cwd: workdir,
              env,
            });
          }
          logs.push(
            phaseLog(
              "rollback",
              metadata.containerName
                ? `Removed container ${metadata.containerName}`
                : "No container metadata recorded",
            ),
          );
          break;
        case "docker-compose-stack":
          if (metadata.composeFile) {
            runSyncCommand({
              command: `docker compose -f ${metadata.composeFile} down`,
              cwd: workdir,
              env,
            });
          }
          logs.push(
            phaseLog(
              "rollback",
              metadata.composeFile
                ? `Stopped compose stack ${metadata.composeFile}`
                : "No compose metadata recorded",
            ),
          );
          break;
      }

      deployment.applyExecutionResult(FinishedAt.rehydrate(new Date().toISOString()), ExecutionResult.rehydrate({
        exitCode: ExitCode.rehydrate(0),
        status: ExecutionStatusValue.rehydrate("rolled-back"),
        retryable: false,
        logs,
      }));
      this.report(context, {
        deploymentId: state.id.value,
        phase: "rollback",
        status: "succeeded",
        message: "Rollback completed",
      });

      return ok({ deployment });
    } catch (error) {
      this.report(context, {
        deploymentId: state.id.value,
        phase: "rollback",
        status: "failed",
        level: "error",
        message: error instanceof Error ? error.message : "Unknown rollback error",
      });
      return ok({
        deployment: this.applyFailure(deployment, {
          logs: [
            phaseLog(
              "rollback",
              error instanceof Error ? error.message : "Unknown rollback error",
              "error",
            ),
          ],
          errorCode: "local_rollback_failed",
          retryable: true,
        }).deployment,
      });
    }
  }
}
