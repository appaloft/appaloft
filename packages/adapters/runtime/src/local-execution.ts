import { spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import {
  createDeploymentProgressEvent,
  deploymentProgressSteps,
  type AppLogger,
  type DeploymentExecutionGuard,
  type DeploymentProgressRecorder,
  type DeploymentProgressReporter,
  type DependencyResourceSecretStore,
  type EdgeProxyProviderRegistry,
  type ExecutionBackend,
  type ExecutionContext,
  type IntegrationAuthPort,
  type ResourceAccessFailureRendererTarget,
} from "@appaloft/application";
import {
  DeploymentTimelineJournalEntry,
  DeploymentTimelineSourceValue,
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
import { classifyEdgeProxyStartFailure } from "./edge-proxy-failure-classification";
import { executeProxyReloadPlan } from "./proxy-reload-execution";
import {
  parseResolvedGitCommitSha,
  shortGitCommitSha,
  sourceCommitShaMetadataKey,
} from "./git-source-metadata";
import {
  gitSubmoduleUpdateArgs,
  githubHttpsSubmodulePrefix,
} from "./git-source-submodules";
import {
  dockerPublishedPortCommand,
  parseDockerPublishedHostPort,
  appaloftDockerContainerLabelsForDeployment,
} from "./docker-container-commands";
import { requireServerBackedDeploymentState } from "./deployment-target";
import { deriveRuntimeInstanceNames } from "./runtime-instance-names";
import {
  RuntimeCommandBuilder,
  dockerLabelsFromAssignments,
  renderRuntimeCommandString,
} from "./runtime-commands";
import {
  cleanupGeneratedDockerBuildAssets,
  writeGeneratedDockerBuildAssets,
} from "./generated-docker-build-assets";
import {
  resolveDependencyRuntimeEnvironment,
  runtimeContainerEnvironmentVariables,
} from "./dependency-runtime-secrets";
import { generateStaticSiteDockerBuild, generateWorkspaceDockerBuild } from "./workspace-planners";
import { runBufferedProcess, shellCommand } from "./buffered-process";
import { renderComposeOwnershipLabelOverrideScript } from "./compose-label-overrides";
import {
  replicatedWorkloadComposeFileFromMetadata,
  replicatedWorkloadReplicasFromMetadata,
  replicatedWorkloadServiceNameFromMetadata,
  renderReplicatedWorkloadCompose,
  renderServiceGraphCompose,
  serviceGraphComposeFileFromMetadata,
  serviceGraphComposeServicesFromMetadata,
} from "./service-graph-compose";
import {
  runtimeTargetCapacityAwareFailureFields,
} from "./runtime-target-failure-classification";
import { createPreviewRuntimeArtifactCleanupPlan } from "./preview-artifact-cleanup";
import {
  dockerStorageMountsFromRuntimeMetadata,
  dockerStorageVolumeRealizationsFromRuntimeMetadata,
  renderDockerVolumeRealizationScript,
} from "./storage-runtime-mounts";

type LogPhase = "detect" | "plan" | "package" | "deploy" | "verify" | "rollback";
type LogLevel = "debug" | "info" | "warn" | "error";
type LogSource = "appaloft" | "ssh" | "docker" | "application" | "provider" | "health" | "domain-event";

const persistedOutputLineLimit = 50;

function composeScaleFromRuntimeMetadata(
  metadata: Record<string, string> | undefined,
): Array<{ serviceName: string; replicas: number }> {
  const serviceName = replicatedWorkloadServiceNameFromMetadata(metadata);
  const replicas = replicatedWorkloadReplicasFromMetadata(metadata);

  return serviceName && replicas ? [{ serviceName, replicas }] : [];
}

function phaseLog(
  phase: LogPhase,
  message: string,
  level: LogLevel = "info",
  source: LogSource = "appaloft",
): DeploymentTimelineJournalEntry {
  return DeploymentTimelineJournalEntry.rehydrate({
    timestamp: OccurredAt.rehydrate(new Date().toISOString()),
    source: DeploymentTimelineSourceValue.rehydrate(source),
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

function supersededDeploymentIdsForCleanup(input: {
  supersedesDeploymentId?: { value: string };
}): string[] {
  return input.supersedesDeploymentId ? [input.supersedesDeploymentId.value] : [];
}

function parseOptionalPort(value: string | undefined): number | undefined {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : undefined;
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

function summarizeCommandFailureOutput(input: { stdout: string; stderr: string }): string | undefined {
  const lines = `${input.stderr}\n${input.stdout}`
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const summary = lines.slice(-3).join(" | ");
  if (!summary) {
    return undefined;
  }

  return summary.length > 800 ? `${summary.slice(0, 797)}...` : summary;
}

async function runShellCommand(input: {
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  redactions?: readonly string[];
}): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  failed: boolean;
  reason?: string;
}> {
  const result = await runBufferedProcess({
    command: shellCommand(input.command),
    cwd: input.cwd,
    env: input.env,
    ...(input.redactions ? { redactions: input.redactions } : {}),
  });

  return {
    exitCode: result.exitCode ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
    failed: result.failed,
    ...(result.reason ? { reason: result.reason } : {}),
  };
}

async function runProcess(input: {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  redactions?: readonly string[];
}): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  failed: boolean;
  reason?: string;
}> {
  const result = await runBufferedProcess({
    command: [input.command, ...input.args],
    cwd: input.cwd,
    env: input.env,
    ...(input.redactions ? { redactions: input.redactions } : {}),
  });

  return {
    exitCode: result.exitCode ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
    failed: result.failed,
    ...(result.reason ? { reason: result.reason } : {}),
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
    private readonly progressRecorder: DeploymentProgressRecorder,
    private readonly progressReporter: DeploymentProgressReporter,
    private readonly integrationAuthPort?: IntegrationAuthPort,
    private readonly edgeProxyProviderRegistry?: EdgeProxyProviderRegistry,
    private readonly resourceAccessFailureRenderer?: () => ResourceAccessFailureRendererTarget | undefined,
    private readonly deploymentExecutionGuard?: DeploymentExecutionGuard,
    private readonly dependencyResourceSecretStore?: DependencyResourceSecretStore,
  ) {}

  private async report(
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
  ): Promise<void> {
    const event = createDeploymentProgressEvent({
      deploymentId: input.deploymentId,
      phase: input.phase,
      message: input.message,
      ...(input.level ? { level: input.level } : {}),
      ...(input.source ? { source: input.source } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.stream ? { stream: input.stream } : {}),
      step: deploymentProgressSteps[input.phase],
    });
    try {
      const result = await this.progressRecorder.record(context, event);
      if (result.isErr()) {
        this.logger.warn("Failed to persist deployment progress event", {
          deploymentId: input.deploymentId,
          phase: input.phase,
          errorCode: result.error.code,
        });
      }
    } catch (error) {
      this.logger.warn("Failed to persist deployment progress event", {
        deploymentId: input.deploymentId,
        phase: input.phase,
        error,
      });
    }
    this.progressReporter.report(context, event);
  }

  private pushOutputLog(
    timeline: DeploymentTimelineJournalEntry[],
    input: {
      context: ExecutionContext;
      deploymentId: string;
      phase: LogPhase;
      line: string;
      level: LogLevel;
      stream: "stdout" | "stderr";
      persistedCount: number;
      source?: LogSource;
    },
  ): number {
    void this.report(input.context, {
      deploymentId: input.deploymentId,
      phase: input.phase,
      source: input.source ?? "application",
      level: input.level,
      message: input.line,
      stream: input.stream,
    });

    if (input.persistedCount >= persistedOutputLineLimit) {
      return input.persistedCount;
    }

    timeline.push(phaseLog(input.phase, input.line, input.level, input.source ?? "application"));
    return input.persistedCount + 1;
  }

  private async ensureExecutionStillOwned(
    context: ExecutionContext,
    deployment: Deployment,
    input: { phase: LogPhase; step: string },
  ): Promise<Result<void>> {
    if (!this.deploymentExecutionGuard) {
      return ok(undefined);
    }

    const decision = await this.deploymentExecutionGuard.shouldContinue(context, deployment);
    if (decision.isErr()) {
      return decision.map(() => undefined);
    }

    if (decision.value.allowed) {
      return ok(undefined);
    }

    return err(
      domainError.conflict("Deployment execution was superseded by a newer deployment", {
        phase: "runtime-execution",
        step: input.step,
        deploymentId: deployment.toState().id.value,
        ...(decision.value.supersededByDeploymentId
          ? { supersededByDeploymentId: decision.value.supersededByDeploymentId }
          : {}),
        causeCode: "deployment_execution_superseded",
      }),
    );
  }

  private pushCommandOutput(
    timeline: DeploymentTimelineJournalEntry[],
    input: {
      context: ExecutionContext;
      deploymentId: string;
      phase: LogPhase;
      output: string;
      level: LogLevel;
      stream: "stdout" | "stderr";
      redactions?: readonly string[];
      source?: LogSource;
    },
  ): void {
    let persistedCount = 0;

    for (const line of redactSecrets(input.output, input.redactions)
      .split(/\r?\n/)
      .map((outputLine) => outputLine.trim())
      .filter((outputLine) => outputLine.length > 0)) {
      persistedCount = this.pushOutputLog(timeline, {
        context: input.context,
        deploymentId: input.deploymentId,
        phase: input.phase,
        line,
        level: classifyOutputLogLevel(line, input.level),
        stream: input.stream,
        persistedCount,
        ...(input.source ? { source: input.source } : {}),
      });
    }
  }

  private applyFailure(
    deployment: Deployment,
    input: {
      timeline: DeploymentTimelineJournalEntry[];
      errorCode: string;
      retryable?: boolean;
      metadata?: Record<string, string>;
    },
  ): { deployment: Deployment } {
    const failureFields = runtimeTargetCapacityAwareFailureFields({
      timeline: input.timeline,
      errorCode: input.errorCode,
      ...(input.metadata ? { metadata: input.metadata } : {}),
      serverId: requireServerBackedDeploymentState(
        deployment,
        "local execution capacity-aware failure fields",
      ).serverId.value,
    });
    deployment.applyExecutionResult(
      FinishedAt.rehydrate(new Date().toISOString()),
      ExecutionResult.rehydrate({
        exitCode: ExitCode.rehydrate(1),
        status: ExecutionStatusValue.rehydrate("failed"),
        timeline: input.timeline,
        retryable: input.retryable ?? false,
        errorCode: ErrorCodeText.rehydrate(failureFields.errorCode),
        ...(failureFields.metadata ? { metadata: failureFields.metadata } : {}),
      }),
    );

    return { deployment };
  }

  private async pushDockerContainerDiagnostics(
    timeline: DeploymentTimelineJournalEntry[],
    input: {
      context: ExecutionContext;
      deploymentId: string;
      workdir: string;
      env: NodeJS.ProcessEnv;
      containerName: string;
    },
  ): Promise<void> {
    const format =
      "status={{.State.Status}} exitCode={{.State.ExitCode}} error={{.State.Error}} oomKilled={{.State.OOMKilled}} finishedAt={{.State.FinishedAt}}";
    const inspectMessage = `Inspect Docker container ${input.containerName}`;
    timeline.push(phaseLog("verify", inspectMessage));
    await this.report(input.context, {
      deploymentId: input.deploymentId,
      phase: "verify",
      status: "running",
      message: inspectMessage,
    });

    const inspect = await runShellCommand({
      command: `docker inspect --format ${shellQuote(format)} ${shellQuote(input.containerName)}`,
      cwd: input.workdir,
      env: input.env,
    });
    this.pushCommandOutput(timeline, {
      context: input.context,
      deploymentId: input.deploymentId,
      phase: "verify",
      output: inspect.stdout,
      level: inspect.failed ? "warn" : "info",
      stream: "stdout",
      source: "docker",
    });
    this.pushCommandOutput(timeline, {
      context: input.context,
      deploymentId: input.deploymentId,
      phase: "verify",
      output: inspect.stderr,
      level: "warn",
      stream: "stderr",
      source: "docker",
    });

    const logsMessage = `Capture Docker logs for ${input.containerName}`;
    timeline.push(phaseLog("verify", logsMessage));
    await this.report(input.context, {
      deploymentId: input.deploymentId,
      phase: "verify",
      status: "running",
      message: logsMessage,
    });

    const dockerLogs = await runShellCommand({
      command: `docker logs --tail 50 ${shellQuote(input.containerName)}`,
      cwd: input.workdir,
      env: input.env,
    });
    this.pushCommandOutput(timeline, {
      context: input.context,
      deploymentId: input.deploymentId,
      phase: "verify",
      output: dockerLogs.stdout,
      level: "info",
      stream: "stdout",
    });
    this.pushCommandOutput(timeline, {
      context: input.context,
      deploymentId: input.deploymentId,
      phase: "verify",
      output: dockerLogs.stderr,
      level: dockerLogs.failed ? "warn" : "info",
      stream: "stderr",
    });

    if (inspect.failed && !inspect.stdout && !inspect.stderr) {
      timeline.push(
        phaseLog(
          "verify",
          `Docker inspect did not return diagnostics for ${input.containerName}`,
          "warn",
        ),
      );
    }

    if (dockerLogs.failed && !dockerLogs.stdout && !dockerLogs.stderr) {
      timeline.push(
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
    timeline: DeploymentTimelineJournalEntry[],
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
        timeline.push(phaseLog("package", message, "error"));
        return {
          prepared: false,
          deployment: this.applyFailure(deployment, {
            timeline,
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
    const tokenizedGithubHttpsPrefix = accessToken
      ? withGitHubAccessToken(githubHttpsSubmodulePrefix, accessToken)
      : undefined;
    const redactions = [
      cloneLocator,
      ...(accessToken ? [accessToken] : []),
      ...(tokenizedGithubHttpsPrefix ? [tokenizedGithubHttpsPrefix] : []),
    ];

    timeline.push(phaseLog("package", `Clone remote git source into ${sourceDir}`));
    await this.report(context, {
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
    const clone = await runProcess({
      command: "git",
      args: cloneArgs,
      cwd: input.runtimeDir,
      env: input.env,
      redactions,
    });
    this.pushCommandOutput(timeline, {
      context,
      deploymentId: state.id.value,
      phase: "package",
      output: clone.stdout,
      level: "info",
      stream: "stdout",
      redactions,
    });
    this.pushCommandOutput(timeline, {
      context,
      deploymentId: state.id.value,
      phase: "package",
      output: clone.stderr,
      level: "warn",
      stream: "stderr",
      redactions,
    });

    if (clone.failed) {
      const message = clone.reason
        ? `Remote git clone failed: ${clone.reason}`
        : `Remote git clone failed with exit code ${clone.exitCode}`;
      timeline.push(phaseLog("package", message, "error"));
      await this.report(context, {
        deploymentId: state.id.value,
        phase: "package",
        status: "failed",
        level: "error",
        message,
      });

      return {
        prepared: false,
        deployment: this.applyFailure(deployment, {
          timeline,
          errorCode: "remote_git_clone_failed",
          retryable: true,
          metadata: {
            source: source.locator,
            sourceDir,
          },
        }).deployment,
      };
    }

    timeline.push(phaseLog("package", `Initialize git submodules in ${sourceDir}`));
    await this.report(context, {
      deploymentId: state.id.value,
      phase: "package",
      status: "running",
      message: "Initialize git submodules",
    });
    const submodule = await runProcess({
      command: "git",
      args: gitSubmoduleUpdateArgs({
        workdir: sourceDir,
        tokenizedGithubHttpsPrefix,
      }),
      cwd: input.runtimeDir,
      env: input.env,
      redactions,
    });
    this.pushCommandOutput(timeline, {
      context,
      deploymentId: state.id.value,
      phase: "package",
      output: submodule.stdout,
      level: "info",
      stream: "stdout",
      redactions,
    });
    this.pushCommandOutput(timeline, {
      context,
      deploymentId: state.id.value,
      phase: "package",
      output: submodule.stderr,
      level: "warn",
      stream: "stderr",
      redactions,
    });

    if (submodule.failed) {
      const message = submodule.reason
        ? `Remote git submodule update failed: ${submodule.reason}`
        : `Remote git submodule update failed with exit code ${submodule.exitCode}`;
      timeline.push(phaseLog("package", message, "error"));
      await this.report(context, {
        deploymentId: state.id.value,
        phase: "package",
        status: "failed",
        level: "error",
        message,
      });

      return {
        prepared: false,
        deployment: this.applyFailure(deployment, {
          timeline,
          errorCode: "remote_git_submodule_update_failed",
          retryable: true,
          metadata: {
            source: source.locator,
            sourceDir,
          },
        }).deployment,
      };
    }

    const commit = await runProcess({
      command: "git",
      args: ["-C", sourceDir, "rev-parse", "--verify", "HEAD"],
      cwd: input.runtimeDir,
      env: input.env,
    });
    const commitSha = parseResolvedGitCommitSha(commit.stdout);

    if (commit.failed || !commitSha) {
      const message = commit.failed
        ? commit.reason
          ? `Remote git commit resolution failed: ${commit.reason}`
          : `Remote git commit resolution failed with exit code ${commit.exitCode}`
        : "Remote git commit resolution returned an invalid object id";
      timeline.push(phaseLog("package", message, "error"));
      await this.report(context, {
        deploymentId: state.id.value,
        phase: "package",
        status: "failed",
        level: "error",
        message,
      });

      return {
        prepared: false,
        deployment: this.applyFailure(deployment, {
          timeline,
          errorCode: "remote_git_commit_resolution_failed",
          retryable: true,
          metadata: {
            phase: "package",
            source: source.locator,
            sourceDir,
          },
        }).deployment,
      };
    }

    const commitMessage = `Resolved git commit ${shortGitCommitSha(commitSha)}`;
    timeline.push(phaseLog("package", commitMessage));
    await this.report(context, {
      deploymentId: state.id.value,
      phase: "package",
      status: "running",
      message: commitMessage,
    });

    await this.report(context, {
      deploymentId: state.id.value,
      phase: "package",
      status: "succeeded",
      message: `Remote git source is ready at ${shortGitCommitSha(commitSha)}`,
    });

    return {
      prepared: true,
      workdir: sourceWorkdir(sourceDir, source.metadata),
      metadata: {
        sourceStrategy: "remote-git",
        sourceDir,
        [sourceCommitShaMetadataKey]: commitSha,
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
    const packageEnv = await resolveDependencyRuntimeEnvironment({
      context,
      deployment,
      dependencyResourceSecretStore: this.dependencyResourceSecretStore,
      port,
      includeDependencyRuntimeSecrets: false,
    });
    if (packageEnv.isErr()) {
      return err(packageEnv.error);
    }
    const { env, redactions } = packageEnv.value;
    const timeline: DeploymentTimelineJournalEntry[] = [
      phaseLog("plan", "Using local host-process execution"),
    ];
    const preparedSource = await this.prepareLocalSource(context, deployment, timeline, {
      runtimeDir,
      env,
      fallbackWorkdir: normalizeWorkingDirectory(
        state.runtimePlan.execution.workingDirectory ?? state.runtimePlan.source.locator,
      ),
    });

    if (!preparedSource.prepared) {
      return ok({ deployment: preparedSource.deployment });
    }

    const workdir = preparedSource.workdir;
    timeline.push(phaseLog("plan", `Host process working directory: ${workdir}`));
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

      timeline.push(phaseLog(phase, `${label}: ${command}`));
      await this.report(context, {
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
        redactions,
        onOutput: (line, level, stream) => {
          persistedCount = this.pushOutputLog(timeline, {
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
        await this.report(context, {
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
      timeline.push(phaseLog(phase, message, "error"));
      await this.report(context, {
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
          timeline,
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
          timeline,
          errorCode: "local_build_failed",
          metadata: {
            workdir,
          },
        }).deployment,
      });
    }

    if (!hasWorkspacePreparation) {
      await this.report(context, {
        deploymentId: state.id.value,
        phase: "package",
        status: "succeeded",
        message: "No workspace install/build commands configured",
      });
    }

    const startCommand = state.runtimePlan.execution.startCommand;
    if (!startCommand) {
      const message = "Start command is required for host-process execution";
      await this.report(context, {
        deploymentId: state.id.value,
        phase: "deploy",
        status: "failed",
        level: "error",
        message,
      });
      return ok({
        deployment: this.applyFailure(deployment, {
          timeline: [
            ...timeline,
            phaseLog("deploy", message, "error"),
          ],
          errorCode: "missing_start_command",
          metadata: {
            workdir,
          },
        }).deployment,
      });
    }

    timeline.push(phaseLog("deploy", `Start command: ${startCommand}`));
    const runtimeEnv = await resolveDependencyRuntimeEnvironment({
      context,
      deployment,
      dependencyResourceSecretStore: this.dependencyResourceSecretStore,
      port,
    });
    if (runtimeEnv.isErr()) {
      return err(runtimeEnv.error);
    }
    const startEnv = runtimeEnv.value.env;
    const startRedactions = runtimeEnv.value.redactions;
    await this.report(context, {
      deploymentId: state.id.value,
      phase: "deploy",
      status: "running",
      message: `Start command: ${startCommand}`,
    });
    const logTailer = new AppLogTailer(logPath, (line) => {
      const redactedLine = redactSecrets(line, startRedactions);
      const persistedCount = timeline.filter(
        (log) => log.source === "application" && log.phase === "deploy",
      ).length;
      this.pushOutputLog(timeline, {
        context,
        deploymentId: state.id.value,
        phase: "deploy",
        line: redactedLine,
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
      env: startEnv,
      shell: true,
      detached: true,
      stdio: ["ignore", stdoutFd, stderrFd],
    });
    closeSync(stdoutFd);
    closeSync(stderrFd);
    child.unref();

    await this.report(context, {
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
      await this.report(context, {
        deploymentId: state.id.value,
        phase: "verify",
        status: "succeeded",
        message: "Health check disabled for resource",
      });
      timeline.push(phaseLog("verify", "Health check disabled for resource"));
      deployment.applyExecutionResult(
        FinishedAt.rehydrate(new Date().toISOString()),
        ExecutionResult.rehydrate({
          exitCode: ExitCode.rehydrate(0),
          status: ExecutionStatusValue.rehydrate("succeeded"),
          retryable: false,
          timeline,
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
    await this.report(context, {
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
      await this.report(context, {
        deploymentId: state.id.value,
        phase: "verify",
        status: "failed",
        level: "error",
        message,
      });
      return ok({
        deployment: this.applyFailure(deployment, {
          timeline: [
            ...timeline,
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
    timeline.push(phaseLog("verify", message));
    await this.report(context, {
      deploymentId: state.id.value,
      phase: "verify",
      status: "succeeded",
      message,
    });
    deployment.applyExecutionResult(FinishedAt.rehydrate(new Date().toISOString()), ExecutionResult.rehydrate({
      exitCode: ExitCode.rehydrate(0),
      status: ExecutionStatusValue.rehydrate("succeeded"),
      retryable: false,
      timeline,
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
    const containerPort = state.runtimePlan.execution.port ?? 3000;
    const usesDirectHostPort =
      state.runtimePlan.execution.metadata?.["resource.exposureMode"] === "direct-port";
    const directHostPort = parseOptionalPort(
      state.runtimePlan.execution.metadata?.["resource.hostPort"],
    );
    if (usesDirectHostPort) {
      await reservePort(directHostPort ?? containerPort);
    }
    const packageEnv = await resolveDependencyRuntimeEnvironment({
      context,
      deployment,
      dependencyResourceSecretStore: this.dependencyResourceSecretStore,
      port: containerPort,
      includeDependencyRuntimeSecrets: false,
    });
    if (packageEnv.isErr()) {
      return err(packageEnv.error);
    }
    const { env } = packageEnv.value;
    const timeline: DeploymentTimelineJournalEntry[] = [
      phaseLog("plan", "Using local docker-container execution"),
    ];
    const preparedSource = await this.prepareLocalSource(context, deployment, timeline, {
      runtimeDir,
      env,
      fallbackWorkdir: normalizeWorkingDirectory(
        state.runtimePlan.execution.workingDirectory ?? state.runtimePlan.source.locator,
      ),
    });

    if (!preparedSource.prepared) {
      return ok({ deployment: preparedSource.deployment });
    }

    const workdir = preparedSource.workdir;
    timeline.push(phaseLog("plan", `Docker working directory: ${workdir}`));
    await this.report(context, {
      deploymentId: state.id.value,
      phase: "package",
      status: "running",
      message: "Prepare Docker container deployment",
    });

    const dockerVersion = await runShellCommand({
      command: "docker version --format '{{.Server.Version}}'",
      cwd: workdir,
      env,
    });

    if (dockerVersion.failed) {
      const message = "Docker is not available on the local machine";
      await this.report(context, {
        deploymentId: state.id.value,
        phase: "package",
        status: "failed",
        level: "error",
        message,
      });
      return ok({
        deployment: this.applyFailure(deployment, {
          timeline: [
            ...timeline,
            phaseLog("deploy", message, "error"),
          ],
          errorCode: "docker_unavailable",
          retryable: false,
        }).deployment,
      });
    }

    const runtimeInstanceNames = deriveRuntimeInstanceNames({
      deploymentId: state.id.value,
      metadata: state.runtimePlan.execution.metadata,
    });
    let image = state.runtimePlan.execution.image;
    const containerName = runtimeInstanceNames.containerName;

    const shouldBuildImage =
      state.runtimePlan.buildStrategy === "dockerfile" ||
      state.runtimePlan.buildStrategy === "workspace-commands" ||
      state.runtimePlan.buildStrategy === "static-artifact";

    if (shouldBuildImage) {
      image = runtimeInstanceNames.imageName;
      const dockerfilePath =
        state.runtimePlan.buildStrategy === "dockerfile"
          ? (state.runtimePlan.execution.dockerfilePath ?? "Dockerfile")
          : resolve(
              runtimeDir,
              state.runtimePlan.execution.dockerfilePath ??
                (state.runtimePlan.buildStrategy === "static-artifact"
                  ? "Dockerfile.appaloft-static"
                  : "Dockerfile.appaloft"),
            );

      let generatedContextAssetPaths: string[] = [];
      try {
        if (state.runtimePlan.buildStrategy === "workspace-commands") {
          const dockerBuild = generateWorkspaceDockerBuild({
            execution: state.runtimePlan.execution,
            ...(state.runtimePlan.source.inspection
              ? { sourceInspection: state.runtimePlan.source.inspection }
              : {}),
          });
          if (!dockerBuild) {
            const message = "Start command is required for workspace image generation";
            await this.report(context, {
              deploymentId: state.id.value,
              phase: "package",
              status: "failed",
              level: "error",
              message,
            });
            return ok({
              deployment: this.applyFailure(deployment, {
                timeline: [
                  ...timeline,
                  phaseLog("package", message, "error"),
                ],
                errorCode: "workspace_start_command_missing",
                retryable: false,
              }).deployment,
            });
          }

          try {
            mkdirSync(runtimeDir, { recursive: true });
            await Bun.write(dockerfilePath, dockerBuild.dockerfile);
            generatedContextAssetPaths = await writeGeneratedDockerBuildAssets(
              workdir,
              dockerBuild.contextAssets,
            );
          } catch {
            const message = "Workspace Docker build asset preparation failed";
            await this.report(context, {
              deploymentId: state.id.value,
              phase: "package",
              status: "failed",
              level: "error",
              message,
            });
            return ok({
              deployment: this.applyFailure(deployment, {
                timeline: [
                  ...timeline,
                  phaseLog("package", message, "error"),
                ],
                errorCode: "workspace_docker_asset_write_failed",
                retryable: true,
              }).deployment,
            });
          }

          timeline.push(phaseLog("package", `Generated workspace Dockerfile at ${dockerfilePath}`));
        }

        if (state.runtimePlan.buildStrategy === "static-artifact") {
          const dockerBuild = generateStaticSiteDockerBuild({
            execution: state.runtimePlan.execution,
            ...(state.runtimePlan.source.inspection
              ? { sourceInspection: state.runtimePlan.source.inspection }
              : {}),
          });
          if (!dockerBuild) {
            const message = "Static publish directory is required for static image generation";
            await this.report(context, {
              deploymentId: state.id.value,
              phase: "package",
              status: "failed",
              level: "error",
              message,
            });
            return ok({
              deployment: this.applyFailure(deployment, {
                timeline: [
                  ...timeline,
                  phaseLog("package", message, "error"),
                ],
                errorCode: "static_dockerfile_generation_failed",
                retryable: false,
              }).deployment,
            });
          }

          try {
            mkdirSync(runtimeDir, { recursive: true });
            await Bun.write(dockerfilePath, dockerBuild.dockerfile);
            generatedContextAssetPaths = await writeGeneratedDockerBuildAssets(
              workdir,
              dockerBuild.contextAssets,
            );
          } catch {
            const message = "Static Docker build asset preparation failed";
            await this.report(context, {
              deploymentId: state.id.value,
              phase: "package",
              status: "failed",
              level: "error",
              message,
            });
            return ok({
              deployment: this.applyFailure(deployment, {
                timeline: [
                  ...timeline,
                  phaseLog("package", message, "error"),
                ],
                errorCode: "static_docker_asset_write_failed",
                retryable: true,
              }).deployment,
            });
          }

          timeline.push(phaseLog("package", `Generated static site Dockerfile at ${dockerfilePath}`));
        }

        const buildCommand = renderRuntimeCommandString(
          RuntimeCommandBuilder.docker().buildImage({
            image,
            dockerfilePath,
            contextPath: workdir,
            labels: dockerLabelsFromAssignments(appaloftDockerContainerLabelsForDeployment(state)),
          }),
          { quote: shellQuote },
        );
        timeline.push(phaseLog("package", buildCommand));
        await this.report(context, {
          deploymentId: state.id.value,
          phase: "package",
          status: "running",
          message: `Build image ${image}`,
        });
        const build = await runShellCommand({
          command: buildCommand,
          cwd: workdir,
          env,
        });
        this.pushCommandOutput(timeline, {
          context,
          deploymentId: state.id.value,
          phase: "package",
        output: build.stdout,
        level: "info",
        stream: "stdout",
        source: "docker",
      });
        this.pushCommandOutput(timeline, {
          context,
          deploymentId: state.id.value,
          phase: "package",
        output: build.stderr,
        level: "warn",
        stream: "stderr",
        source: "docker",
      });

        if (build.failed || !image) {
          const message = "Docker image build failed";
          const failureSummary = summarizeCommandFailureOutput(build);
          const failureLogs = failureSummary
            ? [
                ...timeline,
                phaseLog("package", `${message}: ${failureSummary}`, "error", "application"),
                phaseLog("package", message, "error"),
              ]
            : [
                ...timeline,
                phaseLog("package", message, "error"),
              ];
          await this.report(context, {
            deploymentId: state.id.value,
            phase: "package",
            status: "failed",
            level: "error",
            message: failureSummary ? `${message}: ${failureSummary}` : message,
          });
          return ok({
            deployment: this.applyFailure(deployment, {
              timeline: failureLogs,
              errorCode: "docker_build_failed",
              metadata: {
                dockerBuildExitCode: String(build.exitCode),
                ...(build.reason ? { dockerBuildReason: build.reason } : {}),
                ...(failureSummary ? { dockerBuildFailureSummary: failureSummary } : {}),
              },
              retryable: true,
            }).deployment,
          });
        }
      } finally {
        cleanupGeneratedDockerBuildAssets(generatedContextAssetPaths);
      }
    }

    if (!image) {
      const message = "Docker image is required for docker execution";
      await this.report(context, {
        deploymentId: state.id.value,
        phase: "package",
        status: "failed",
        level: "error",
        message,
      });
      return ok({
        deployment: this.applyFailure(deployment, {
          timeline: [
            ...timeline,
            phaseLog("package", message, "error"),
          ],
          errorCode: "missing_docker_image",
        }).deployment,
      });
    }

    await this.report(context, {
      deploymentId: state.id.value,
      phase: "package",
      status: "succeeded",
      message: "Docker package is ready",
    });

    const deployOwnershipResult = await this.ensureExecutionStillOwned(context, deployment, {
      phase: "deploy",
      step: "before-deploy",
    });
    if (deployOwnershipResult.isErr()) {
      return deployOwnershipResult.map(() => ({ deployment }));
    }

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
      timeline.push(phaseLog("deploy", message, "error"));
      return ok({
        deployment: this.applyFailure(deployment, {
          timeline,
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
      timeline.push(phaseLog("deploy", proxyMessage));
      await this.report(context, {
        deploymentId: state.id.value,
        phase: "deploy",
        status: "running",
        message: proxyMessage,
      });

      const network = await runShellCommand({
        command: proxyBootstrap.networkCommand,
        cwd: workdir,
        env,
      });
      this.pushCommandOutput(timeline, {
        context,
        deploymentId: state.id.value,
        phase: "deploy",
        output: network.stdout,
        level: "info",
        stream: "stdout",
      });
      this.pushCommandOutput(timeline, {
        context,
        deploymentId: state.id.value,
        phase: "deploy",
        output: network.stderr,
        level: "warn",
        stream: "stderr",
      });

      const proxy = await runShellCommand({
        command: proxyBootstrap.containerCommand,
        cwd: workdir,
        env,
      });
      this.pushCommandOutput(timeline, {
        context,
        deploymentId: state.id.value,
        phase: "deploy",
        output: proxy.stdout,
        level: "info",
        stream: "stdout",
      });
      this.pushCommandOutput(timeline, {
        context,
        deploymentId: state.id.value,
        phase: "deploy",
        output: proxy.stderr,
        level: "warn",
        stream: "stderr",
      });

      if (network.failed || proxy.failed) {
        const failure = classifyEdgeProxyStartFailure({
          containerName: proxyBootstrap.containerName,
          defaultErrorCode: "edge_proxy_start_failed",
          defaultMessage: `${proxyBootstrap.displayName} edge proxy failed to start`,
          networkName: proxyBootstrap.networkName,
          output: `${network.stdout}\n${network.stderr}\n${proxy.stdout}\n${proxy.stderr}`,
          providerKey: proxyBootstrap.providerKey,
          proxyKind: proxyBootstrap.proxyKind,
        });
        const message = failure.message;
        await this.report(context, {
          deploymentId: state.id.value,
          phase: "deploy",
          status: "failed",
          level: "error",
          message,
        });
        return ok({
          deployment: this.applyFailure(deployment, {
            timeline: [
              ...timeline,
              phaseLog("deploy", message, "error"),
            ],
            errorCode: failure.errorCode,
            retryable: failure.retryable,
            metadata: {
              ...preparedSource.metadata,
              ...failure.metadata,
            },
          }).deployment,
        });
      }

      const readyMessage = `${proxyBootstrap.displayName} edge proxy is ready`;
      timeline.push(phaseLog("deploy", readyMessage));
      await this.report(context, {
        deploymentId: state.id.value,
        phase: "deploy",
        status: "succeeded",
        message: readyMessage,
      });
    }

    const dockerCommandBuilder = RuntimeCommandBuilder.docker();
    const supersededDeploymentIds = supersededDeploymentIdsForCleanup(state);
    const removeSupersededResourceContainersSpec =
      dockerCommandBuilder.removeResourceContainers({
        resourceId: state.resourceId.value,
        deploymentIds: supersededDeploymentIds,
      });
    await runShellCommand({
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
    if (usesDirectHostPort && supersededDeploymentIds.length > 0) {
      await runShellCommand({
        command: renderRuntimeCommandString(removeSupersededResourceContainersSpec, {
          quote: shellQuote,
        }),
        cwd: workdir,
        env,
      });
      timeline.push(
        phaseLog("deploy", `Release existing containers for resource ${state.resourceId.value}`),
      );
    }

    const resourceAccessFailureRenderer = this.resourceAccessFailureRenderer?.();
    const proxyRoutePlanResult = this.edgeProxyProviderRegistry
      ? await createProxyRouteRealizationPlan({
          providerRegistry: this.edgeProxyProviderRegistry,
          context: {
            correlationId: context.requestId,
          },
          deploymentId: state.id.value,
          port: containerPort,
          accessRoutes,
          ...(resourceAccessFailureRenderer ? { resourceAccessFailureRenderer } : {}),
        })
      : ok(null);
    if (proxyRoutePlanResult.isErr()) {
      const message = "Edge proxy route configuration could not be rendered";
      timeline.push(phaseLog("deploy", message, "error"));
      return ok({
        deployment: this.applyFailure(deployment, {
          timeline,
          errorCode: proxyRoutePlanResult.error.code,
          retryable: proxyRoutePlanResult.error.retryable,
          metadata: {
            message: proxyRoutePlanResult.error.message,
            phase: "proxy-route-realization",
          },
        }).deployment,
      });
    }

    const runtimeEnv = await resolveDependencyRuntimeEnvironment({
      context,
      deployment,
      dependencyResourceSecretStore: this.dependencyResourceSecretStore,
      port: containerPort,
    });
    if (runtimeEnv.isErr()) {
      return err(runtimeEnv.error);
    }
    const {
      env: runtimeExecutionEnv,
      redactions,
      dependencyTargetNames,
    } = runtimeEnv.value;
    const dockerEnvVariables = runtimeContainerEnvironmentVariables({
      env: runtimeExecutionEnv,
      state,
      dependencyTargetNames,
    });
    const labels = dockerLabelsFromAssignments([
      ...appaloftDockerContainerLabelsForDeployment(state),
      ...(proxyRoutePlanResult.value?.labels ?? []),
    ]);
    const storageMounts = dockerStorageMountsFromRuntimeMetadata(state.runtimePlan.execution.metadata);
    if (storageMounts.isErr()) {
      const message = "Storage mounts could not be rendered for Docker";
      timeline.push(phaseLog("deploy", message, "error"));
      return ok({
        deployment: this.applyFailure(deployment, {
          timeline,
          errorCode: storageMounts.error.code,
          retryable: storageMounts.error.retryable,
          metadata: {
            message: storageMounts.error.message,
            phase: "storage-runtime-realization",
          },
        }).deployment,
      });
    }
    const storageVolumeRealizations = dockerStorageVolumeRealizationsFromRuntimeMetadata(
      state.runtimePlan.execution.metadata,
    );
    if (storageVolumeRealizations.isErr()) {
      const message = "Storage volume realization could not be rendered for Docker";
      timeline.push(phaseLog("deploy", message, "error"));
      return ok({
        deployment: this.applyFailure(deployment, {
          timeline,
          errorCode: storageVolumeRealizations.error.code,
          retryable: storageVolumeRealizations.error.retryable,
          metadata: {
            message: storageVolumeRealizations.error.message,
            phase: "storage-runtime-realization",
          },
        }).deployment,
      });
    }
    const realizeStorageVolumesCommand = renderDockerVolumeRealizationScript({
      realizations: storageVolumeRealizations.value,
      quote: shellQuote,
    });
    if (realizeStorageVolumesCommand.length > 0) {
      timeline.push(phaseLog("deploy", "Realize Docker storage volumes with Appaloft ownership labels"));
      const realizeStorageVolumes = await runShellCommand({
        command: realizeStorageVolumesCommand,
        cwd: workdir,
        env: runtimeExecutionEnv,
        redactions,
      });
      this.pushCommandOutput(timeline, {
        context,
        deploymentId: state.id.value,
        phase: "deploy",
        output: realizeStorageVolumes.stdout,
        level: "info",
        stream: "stdout",
        source: "docker",
      });
      this.pushCommandOutput(timeline, {
        context,
        deploymentId: state.id.value,
        phase: "deploy",
        output: realizeStorageVolumes.stderr,
        level: "warn",
        stream: "stderr",
        source: "docker",
      });
      if (realizeStorageVolumes.failed) {
        const message = "Docker storage volumes could not be realized";
        timeline.push(phaseLog("deploy", message, "error"));
        return ok({
          deployment: this.applyFailure(deployment, {
            timeline,
            errorCode: "docker_storage_volume_realization_failed",
            retryable: true,
            metadata: {
              message,
              phase: "storage-runtime-realization",
            },
          }).deployment,
        });
      }
    }
    const runCommandSpec = dockerCommandBuilder.runContainer({
      image,
      containerName,
      restartPolicy: "unless-stopped",
      env: dockerEnvVariables,
      labels,
      mounts: storageMounts.value,
      ...(proxyRoutePlanResult.value?.networkName
        ? { networkName: proxyRoutePlanResult.value.networkName }
        : {}),
      publishedPorts: [
        dockerCommandBuilder.publishPort({
          containerPort,
          mode: usesDirectHostPort ? "host-same-port" : "loopback-ephemeral",
          ...(usesDirectHostPort && directHostPort ? { hostPort: directHostPort } : {}),
        }),
      ],
    });
    const runCommand = renderRuntimeCommandString(runCommandSpec, { quote: shellQuote });
    timeline.push(
      phaseLog(
        "deploy",
        renderRuntimeCommandString(runCommandSpec, { quote: shellQuote, mode: "display" }),
      ),
    );
    await this.report(context, {
      deploymentId: state.id.value,
      phase: "deploy",
      status: "running",
      message: `Start container ${containerName}`,
    });
    const run = await runShellCommand({
      command: runCommand,
      cwd: workdir,
      env: runtimeExecutionEnv,
      redactions,
    });
    this.pushCommandOutput(timeline, {
      context,
      deploymentId: state.id.value,
      phase: "deploy",
      output: run.stdout,
      level: "info",
      stream: "stdout",
      source: "docker",
    });
    this.pushCommandOutput(timeline, {
      context,
      deploymentId: state.id.value,
      phase: "deploy",
      output: run.stderr,
      level: "warn",
      stream: "stderr",
      source: "docker",
    });

    if (run.failed) {
      const message = "Docker container failed to start";
      await this.report(context, {
        deploymentId: state.id.value,
        phase: "deploy",
        status: "failed",
        level: "error",
        message,
      });
      return ok({
        deployment: this.applyFailure(deployment, {
          timeline: [
            ...timeline,
            phaseLog("deploy", message, "error"),
          ],
          errorCode: "docker_run_failed",
          retryable: true,
          metadata: {
            image,
            containerName,
            port: String(containerPort),
            ...preparedSource.metadata,
          },
        }).deployment,
      });
    }
    await this.report(context, {
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
      timeline.push(phaseLog("deploy", message, "error"));
      return ok({
        deployment: this.applyFailure(deployment, {
          timeline,
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
      await this.report(context, {
        deploymentId: state.id.value,
        phase: "deploy",
        status: "running",
        message: `Reload ${proxyReloadPlan.displayName} edge proxy`,
      });
      const reload = await executeProxyReloadPlan({
        plan: proxyReloadPlan,
        runCommand: async (step) =>
          await runShellCommand({
            command: step.command ?? "",
            cwd: workdir,
            env,
          }),
      });

      for (const entry of reload.timeline) {
        timeline.push(phaseLog("deploy", entry.message, entry.stderr ? "warn" : "info"));
        this.pushCommandOutput(timeline, {
          context,
          deploymentId: state.id.value,
          phase: "deploy",
          output: entry.stdout ?? "",
          level: "info",
          stream: "stdout",
          source: "docker",
        });
        this.pushCommandOutput(timeline, {
          context,
          deploymentId: state.id.value,
          phase: "deploy",
          output: entry.stderr ?? "",
          level: "warn",
          stream: "stderr",
          source: "docker",
        });
      }

      if (reload.status === "failed") {
        await this.report(context, {
          deploymentId: state.id.value,
          phase: "deploy",
          status: "failed",
          level: "error",
          message: reload.message,
        });
        return ok({
          deployment: this.applyFailure(deployment, {
            timeline: [
              ...timeline,
              phaseLog("deploy", reload.message, "error"),
            ],
            errorCode: reload.errorCode,
            retryable: reload.retryable,
            metadata: {
              ...preparedSource.metadata,
              providerKey: proxyReloadPlan.providerKey,
              proxyKind: proxyReloadPlan.proxyKind,
              stepName: reload.stepName,
              phase: "proxy-reload",
            },
          }).deployment,
        });
      }

      await this.report(context, {
        deploymentId: state.id.value,
        phase: "deploy",
        status: "succeeded",
        message: `${proxyReloadPlan.displayName} edge proxy reload is complete`,
      });
    }

    const healthPath = state.runtimePlan.execution.healthCheckPath ?? "/";
    const publishedPortResult = await runShellCommand({
      command: dockerPublishedPortCommand({
        containerName,
        containerPort,
        quote: shellQuote,
      }),
      cwd: workdir,
      env,
    });
    const publishedHostPort = parseDockerPublishedHostPort(publishedPortResult.stdout);

    if (publishedPortResult.failed || publishedHostPort === undefined) {
      await this.pushDockerContainerDiagnostics(timeline, {
        context,
        deploymentId: state.id.value,
        workdir,
        env,
        containerName,
      });
      await runShellCommand({
        command: `docker rm -f ${containerName}`,
        cwd: workdir,
        env,
      });
      const message = `Docker published port could not be resolved for ${containerName}`;
      await this.report(context, {
        deploymentId: state.id.value,
        phase: "verify",
        status: "failed",
        level: "error",
        message,
      });
      return ok({
        deployment: this.applyFailure(deployment, {
          timeline: [
            ...timeline,
            phaseLog("verify", message, "error"),
          ],
          errorCode: "docker_published_port_resolution_failed",
          retryable: true,
          metadata: {
            image,
            containerName,
            port: String(containerPort),
            ...preparedSource.metadata,
          },
        }).deployment,
      });
    }

    const url = `http://127.0.0.1:${publishedHostPort}${healthPath}`;
    const healthOptions = httpHealthCheckOptions(state.runtimePlan.execution);
    if (!healthOptions) {
      await this.report(context, {
        deploymentId: state.id.value,
        phase: "verify",
        status: "succeeded",
        message: "Health check disabled for resource",
      });
      timeline.push(phaseLog("verify", "Health check disabled for resource"));
      deployment.applyExecutionResult(
        FinishedAt.rehydrate(new Date().toISOString()),
        ExecutionResult.rehydrate({
          exitCode: ExitCode.rehydrate(0),
          status: ExecutionStatusValue.rehydrate("succeeded"),
          retryable: false,
          timeline,
          metadata: {
            image,
            containerName,
            port: String(containerPort),
            publishedPort: String(publishedHostPort),
            ...preparedSource.metadata,
          },
        }),
      );
      return ok({ deployment });
    }
    await this.report(context, {
      deploymentId: state.id.value,
      phase: "verify",
      status: "running",
      message: `Checking ${url}`,
    });
    const health = await waitForHealth(url, healthOptions);

    if (!health.ok) {
      await this.pushDockerContainerDiagnostics(timeline, {
        context,
        deploymentId: state.id.value,
        workdir,
        env,
        containerName,
      });
      await runShellCommand({
        command: `docker rm -f ${containerName}`,
        cwd: workdir,
        env,
      });
      const message = `Container health check failed for ${url}${health.reason ? `: ${health.reason}` : ""}`;
      await this.report(context, {
        deploymentId: state.id.value,
        phase: "verify",
        status: "failed",
        level: "error",
        message,
      });
      return ok({
        deployment: this.applyFailure(deployment, {
          timeline: [
            ...timeline,
            phaseLog("verify", message, "error"),
          ],
          errorCode: "docker_health_check_failed",
          retryable: true,
          metadata: {
            image,
            containerName,
            port: String(containerPort),
            publishedPort: String(publishedHostPort),
            url,
            ...preparedSource.metadata,
          },
        }).deployment,
      });
    }

    const message = `Container is reachable at ${url}`;
    timeline.push(phaseLog("verify", message));
    await this.report(context, {
      deploymentId: state.id.value,
      phase: "verify",
      status: "succeeded",
      message,
    });
    if (!usesDirectHostPort && supersededDeploymentIds.length > 0) {
      const cleanup = await runShellCommand({
        command: renderRuntimeCommandString(removeSupersededResourceContainersSpec, {
          quote: shellQuote,
        }),
        cwd: workdir,
        env,
      });
      timeline.push(
        phaseLog(
          "deploy",
          cleanup.failed
            ? `Failed to release superseded containers for resource ${state.resourceId.value}`
            : `Released superseded containers for resource ${state.resourceId.value}`,
          cleanup.failed ? "warn" : "info",
        ),
      );
    }
    deployment.applyExecutionResult(FinishedAt.rehydrate(new Date().toISOString()), ExecutionResult.rehydrate({
      exitCode: ExitCode.rehydrate(0),
      status: ExecutionStatusValue.rehydrate("succeeded"),
      retryable: false,
      timeline,
      metadata: {
        image,
        containerName,
        port: String(containerPort),
        publishedPort: String(publishedHostPort),
        url,
        ...preparedSource.metadata,
      },
    }));
    return ok({ deployment });
  }

  private async prepareGeneratedServiceGraphCompose(input: {
    context: ExecutionContext;
    deployment: Deployment;
    timeline: DeploymentTimelineJournalEntry[];
    workdir: string;
    image: string;
    environment?: Record<string, string>;
  }): Promise<Result<{ composeFile?: string }>> {
    const state = input.deployment.toState();
    const replicatedComposeFile = replicatedWorkloadComposeFileFromMetadata(
      state.runtimePlan.execution.metadata,
    );
    if (replicatedComposeFile) {
      const serviceName = replicatedWorkloadServiceNameFromMetadata(
        state.runtimePlan.execution.metadata,
      );
      const replicas = replicatedWorkloadReplicasFromMetadata(state.runtimePlan.execution.metadata);
      if (!serviceName || !replicas) {
        const message = "Replicated workload metadata is incomplete";
        input.timeline.push(phaseLog("package", message, "error"));
        return ok({ composeFile: replicatedComposeFile });
      }

      const dockerfilePath =
        state.runtimePlan.execution.dockerfilePath ?? state.runtimePlan.runtimeArtifact?.metadata?.dockerfilePath;
      const defaultPort = state.runtimePlan.execution.port;
      if (dockerfilePath) {
        const dockerBuild = generateWorkspaceDockerBuild({
          execution: state.runtimePlan.execution,
          ...(state.runtimePlan.source.inspection
            ? { sourceInspection: state.runtimePlan.source.inspection }
            : {}),
        });
        if (dockerBuild) {
          const absoluteDockerfilePath = resolve(input.workdir, dockerfilePath);
          mkdirSync(dirname(absoluteDockerfilePath), { recursive: true });
          await Bun.write(absoluteDockerfilePath, dockerBuild.dockerfile);
          await writeGeneratedDockerBuildAssets(input.workdir, dockerBuild.contextAssets);
        }
      }

      const composeFilePath = resolve(input.workdir, replicatedComposeFile);
      mkdirSync(dirname(composeFilePath), { recursive: true });
      writeFileSync(
        composeFilePath,
        renderReplicatedWorkloadCompose({
          image: input.image,
          ...(dockerfilePath ? { dockerfilePath } : {}),
          serviceName,
          ...(defaultPort ? { defaultPort } : {}),
          replicas,
          ...(state.runtimePlan.execution.startCommand
            ? { command: state.runtimePlan.execution.startCommand }
            : {}),
          ...(input.environment ? { environment: input.environment } : {}),
          includeBuild: Boolean(dockerfilePath),
        }),
      );

      input.timeline.push(phaseLog("package", `Generated replicated workload compose file ${replicatedComposeFile}`));
      await this.report(input.context, {
        deploymentId: state.id.value,
        phase: "package",
        status: "succeeded",
        message: "Generated replicated workload compose file",
      });

      return ok({ composeFile: composeFilePath });
    }

    const composeFile = serviceGraphComposeFileFromMetadata(state.runtimePlan.execution.metadata);
    if (!composeFile) {
      return ok({});
    }

    const services = serviceGraphComposeServicesFromMetadata(state.runtimePlan.execution.metadata);
    if (services.length === 0) {
      const message = "Repository service graph metadata is missing services";
      input.timeline.push(phaseLog("package", message, "error"));
      return ok({
        composeFile,
      });
    }

    const dockerBuild = generateWorkspaceDockerBuild({
      execution: state.runtimePlan.execution,
      ...(state.runtimePlan.source.inspection
        ? { sourceInspection: state.runtimePlan.source.inspection }
        : {}),
    });
    if (!dockerBuild) {
      return err(
        domainError.validation("Workspace service graph requires generated Docker build metadata", {
          phase: "runtime-plan-resolution",
          runtimePlanStrategy: state.runtimePlan.buildStrategy,
        }),
      );
    }

    const dockerfilePath = resolve(
      input.workdir,
      state.runtimePlan.execution.dockerfilePath ?? ".appaloft/Dockerfile.appaloft",
    );
    const relativeDockerfilePath = state.runtimePlan.execution.dockerfilePath ?? "Dockerfile.appaloft";
    mkdirSync(dirname(dockerfilePath), { recursive: true });
    await Bun.write(dockerfilePath, dockerBuild.dockerfile);
    await writeGeneratedDockerBuildAssets(input.workdir, dockerBuild.contextAssets);

    const composeFilePath = resolve(input.workdir, composeFile);
    mkdirSync(dirname(composeFilePath), { recursive: true });
    writeFileSync(
      composeFilePath,
      renderServiceGraphCompose({
        image: input.image,
        dockerfilePath: relativeDockerfilePath,
        services,
        defaultPort: state.runtimePlan.execution.port ?? 3000,
        ...(input.environment ? { environment: input.environment } : {}),
      }),
    );

    input.timeline.push(phaseLog("package", `Generated repository service graph compose file ${composeFile}`));
    await this.report(input.context, {
      deploymentId: state.id.value,
      phase: "package",
      status: "succeeded",
      message: "Generated repository service graph compose file",
    });

    return ok({ composeFile: composeFilePath });
  }

  private async executeDockerCompose(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    const state = deployment.toState();
    const runtimeDir = this.runtimeDirectory(state.id.value);
    const packageEnv = await resolveDependencyRuntimeEnvironment({
      context,
      deployment,
      dependencyResourceSecretStore: this.dependencyResourceSecretStore,
      ...(state.runtimePlan.execution.port ? { port: state.runtimePlan.execution.port } : {}),
      includeDependencyRuntimeSecrets: false,
    });
    if (packageEnv.isErr()) {
      return err(packageEnv.error);
    }
    const { env } = packageEnv.value;
    const timeline: DeploymentTimelineJournalEntry[] = [
      phaseLog("plan", "Using local docker-compose-stack execution"),
    ];
    const preparedSource = await this.prepareLocalSource(context, deployment, timeline, {
      runtimeDir,
      env,
      fallbackWorkdir: normalizeWorkingDirectory(
        state.runtimePlan.execution.workingDirectory ?? state.runtimePlan.source.locator,
      ),
    });

    if (!preparedSource.prepared) {
      return ok({ deployment: preparedSource.deployment });
    }

    const workdir = preparedSource.workdir;
    const runtimeInstanceNames = deriveRuntimeInstanceNames({
      deploymentId: state.id.value,
      metadata: state.runtimePlan.execution.metadata,
    });
    const deployOwnershipResult = await this.ensureExecutionStillOwned(context, deployment, {
      phase: "deploy",
      step: "before-compose-up",
    });
    if (deployOwnershipResult.isErr()) {
      return deployOwnershipResult.map(() => ({ deployment }));
    }
    const runtimeEnv = await resolveDependencyRuntimeEnvironment({
      context,
      deployment,
      dependencyResourceSecretStore: this.dependencyResourceSecretStore,
      ...(state.runtimePlan.execution.port ? { port: state.runtimePlan.execution.port } : {}),
    });
    if (runtimeEnv.isErr()) {
      return err(runtimeEnv.error);
    }
    const runtimeEnvPlaceholders = Object.fromEntries(
      runtimeContainerEnvironmentVariables({
        env: runtimeEnv.value.env,
        state,
        dependencyTargetNames: runtimeEnv.value.dependencyTargetNames,
      }).map((variable) => [variable.name, `\${${variable.name}}`]),
    );
    const generatedCompose = await this.prepareGeneratedServiceGraphCompose({
      context,
      deployment,
      timeline,
      workdir,
      image: runtimeInstanceNames.imageName,
      environment: runtimeEnvPlaceholders,
    });
    if (generatedCompose.isErr()) {
      return err(generatedCompose.error);
    }
    const composeFile =
      generatedCompose.value.composeFile ??
      (isRemoteGitSourceKind(state.runtimePlan.source.kind) &&
      (!state.runtimePlan.execution.composeFile ||
        state.runtimePlan.execution.composeFile === state.runtimePlan.source.locator)
        ? resolve(workdir, "docker-compose.yml")
        : (state.runtimePlan.execution.composeFile ?? state.runtimePlan.source.locator));
    const composeOwnershipOverrideFile = resolve(workdir, ".appaloft.compose.labels.override.yml");
    timeline.push(phaseLog("plan", `Compose working directory: ${workdir}`));
    const composeOwnershipLabels = dockerLabelsFromAssignments(
      appaloftDockerContainerLabelsForDeployment(state),
    );
    const storageMounts = dockerStorageMountsFromRuntimeMetadata(state.runtimePlan.execution.metadata);
    if (storageMounts.isErr()) {
      const message = "Storage mounts could not be rendered for Docker Compose";
      timeline.push(phaseLog("deploy", message, "error"));
      return ok({
        deployment: this.applyFailure(deployment, {
          timeline,
          errorCode: storageMounts.error.code,
          retryable: storageMounts.error.retryable,
          metadata: {
            message: storageMounts.error.message,
            phase: "storage-runtime-realization",
            composeFile,
            composeProjectName: runtimeInstanceNames.composeProjectName,
            ...preparedSource.metadata,
          },
        }).deployment,
      });
    }
    const storageVolumeRealizations = dockerStorageVolumeRealizationsFromRuntimeMetadata(
      state.runtimePlan.execution.metadata,
    );
    if (storageVolumeRealizations.isErr()) {
      const message = "Storage volume realization could not be rendered for Docker Compose";
      timeline.push(phaseLog("deploy", message, "error"));
      return ok({
        deployment: this.applyFailure(deployment, {
          timeline,
          errorCode: storageVolumeRealizations.error.code,
          retryable: storageVolumeRealizations.error.retryable,
          metadata: {
            message: storageVolumeRealizations.error.message,
            phase: "storage-runtime-realization",
            composeFile,
            composeProjectName: runtimeInstanceNames.composeProjectName,
            ...preparedSource.metadata,
          },
        }).deployment,
      });
    }
    timeline.push(phaseLog("deploy", "Generate Appaloft compose ownership labels override"));
    const composeOverride = await runShellCommand({
      command: renderComposeOwnershipLabelOverrideScript({
        composeFile,
        overrideFile: composeOwnershipOverrideFile,
        labels: composeOwnershipLabels,
        mounts: storageMounts.value,
        volumeRealizations: storageVolumeRealizations.value,
        quote: shellQuote,
      }),
      cwd: workdir,
      env: runtimeEnv.value.env,
      redactions: runtimeEnv.value.redactions,
    });
    this.pushCommandOutput(timeline, {
      context,
      deploymentId: state.id.value,
      phase: "deploy",
      output: composeOverride.stdout,
      level: "info",
      stream: "stdout",
      source: "docker",
    });
    this.pushCommandOutput(timeline, {
      context,
      deploymentId: state.id.value,
      phase: "deploy",
      output: composeOverride.stderr,
      level: "warn",
      stream: "stderr",
      source: "docker",
    });
    if (composeOverride.failed) {
      return ok({
        deployment: this.applyFailure(deployment, {
          timeline,
          errorCode: "docker_compose_label_override_failed",
          retryable: false,
          metadata: {
            composeFile,
            composeProjectName: runtimeInstanceNames.composeProjectName,
            composeOwnershipOverrideFile,
            ...preparedSource.metadata,
          },
        }).deployment,
      });
    }
    const upCommand = renderRuntimeCommandString(
      RuntimeCommandBuilder.docker().composeUp({
        composeFile,
        additionalComposeFiles: [composeOwnershipOverrideFile],
        projectName: runtimeInstanceNames.composeProjectName,
        scales: composeScaleFromRuntimeMetadata(state.runtimePlan.execution.metadata),
      }),
      { quote: shellQuote },
    );
    timeline.push(phaseLog("deploy", upCommand));
    await this.report(context, {
      deploymentId: state.id.value,
      phase: "deploy",
      status: "running",
      message: `Start compose stack ${composeFile}`,
    });

    const up = await runShellCommand({
      command: upCommand,
      cwd: workdir,
      env: runtimeEnv.value.env,
      redactions: runtimeEnv.value.redactions,
    });
    this.pushCommandOutput(timeline, {
      context,
      deploymentId: state.id.value,
      phase: "deploy",
      output: up.stdout,
      level: "info",
      stream: "stdout",
      source: "docker",
    });
    this.pushCommandOutput(timeline, {
      context,
      deploymentId: state.id.value,
      phase: "deploy",
      output: up.stderr,
      level: "warn",
      stream: "stderr",
      source: "docker",
    });

    if (up.failed) {
      const message = "Docker compose deployment failed";
      await this.report(context, {
        deploymentId: state.id.value,
        phase: "deploy",
        status: "failed",
        level: "error",
        message,
      });
      return ok({
        deployment: this.applyFailure(deployment, {
          timeline: [
            ...timeline,
            phaseLog("deploy", message, "error"),
          ],
          errorCode: "docker_compose_failed",
          retryable: true,
          metadata: {
            composeFile,
            composeProjectName: runtimeInstanceNames.composeProjectName,
            composeOwnershipOverrideFile,
            workdir,
            ...preparedSource.metadata,
          },
        }).deployment,
      });
    }

    await this.report(context, {
      deploymentId: state.id.value,
      phase: "deploy",
      status: "succeeded",
      message: "Compose stack started",
    });
    const message = "Compose stack started successfully";
    timeline.push(phaseLog("verify", message));
    await this.report(context, {
      deploymentId: state.id.value,
      phase: "verify",
      status: "succeeded",
      message,
    });
    deployment.applyExecutionResult(FinishedAt.rehydrate(new Date().toISOString()), ExecutionResult.rehydrate({
      exitCode: ExitCode.rehydrate(0),
      status: ExecutionStatusValue.rehydrate("succeeded"),
      retryable: false,
      timeline,
      metadata: {
        composeFile,
        composeProjectName: runtimeInstanceNames.composeProjectName,
        composeOwnershipOverrideFile,
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
      await this.report(context, {
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
          timeline: [
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
  ): Promise<Result<{ timeline: DeploymentTimelineJournalEntry[] }>> {
    const state = deployment.toState();
    const metadata = state.runtimePlan.execution.metadata ?? {};
    const runtimeDir = this.runtimeDirectory(state.id.value);
    const runtimeEnv = await resolveDependencyRuntimeEnvironment({
      context,
      deployment,
      dependencyResourceSecretStore: this.dependencyResourceSecretStore,
      includeDependencyRuntimeSecrets: false,
    });
    if (runtimeEnv.isErr()) {
      return err(runtimeEnv.error);
    }
    const { env } = runtimeEnv.value;
    const workdir =
      state.runtimePlan.execution.workingDirectory ??
      normalizeWorkingDirectory(state.runtimePlan.source.locator);
    const timeline: DeploymentTimelineJournalEntry[] = [];
    const runtimeInstanceNames = deriveRuntimeInstanceNames({
      deploymentId: state.id.value,
      metadata: state.runtimePlan.execution.metadata,
    });

    switch (state.runtimePlan.execution.kind) {
      case "host-process":
        killProcess(metadata.pid);
        timeline.push(
          phaseLog(
            "deploy",
            metadata.pid ? `Stopped process ${metadata.pid}` : "No process id recorded",
          ),
        );
        break;
      case "docker-container": {
        const containerName = metadata.containerName ?? runtimeInstanceNames.containerName;
        await runShellCommand({
          command: `docker rm -f ${shellQuote(containerName)} >/dev/null 2>&1 || true`,
          cwd: workdir,
          env,
        });
        timeline.push(phaseLog("deploy", `Removed container ${containerName}`));
        break;
      }
      case "docker-compose-stack":
        {
          const composeFile = metadata.composeFile ?? state.runtimePlan.execution.composeFile;
          const composeProjectName =
            metadata.composeProjectName ?? runtimeInstanceNames.composeProjectName;
          if (composeFile) {
            const composeProjectFlag = `-p ${shellQuote(composeProjectName)} `;
            await runShellCommand({
              command: `docker compose ${composeProjectFlag}-f ${shellQuote(composeFile)} down`,
              cwd: workdir,
              env,
            });
          }
          timeline.push(
            phaseLog(
              "deploy",
              composeFile
                ? `Stopped compose stack ${composeFile}`
                : "No compose metadata recorded",
            ),
          );
        }
        break;
    }

    const artifactCleanup = createPreviewRuntimeArtifactCleanupPlan({
      deploymentId: state.id.value,
      buildStrategy: state.runtimePlan.buildStrategy,
      sourceKind: state.runtimePlan.source.kind,
      executionKind: state.runtimePlan.execution.kind,
      imageName: runtimeInstanceNames.imageName,
      metadata,
      runtimeDir,
    });
    try {
      if (artifactCleanup.localSourceDir) {
        rmSync(artifactCleanup.localSourceDir, { recursive: true, force: true });
        timeline.push(
          phaseLog("deploy", `Removed preview source workspace ${artifactCleanup.localSourceDir}`),
        );
      }
    } catch (error) {
      return err(
        domainError.infra("Preview local artifact cleanup failed", {
          phase: "runtime-cleanup",
          cleanupStage: "artifact-cleanup",
          deploymentId: state.id.value,
          errorMessage: error instanceof Error ? error.message : String(error),
        }),
      );
    }
    if (artifactCleanup.imageName) {
      await runShellCommand({
        command: `docker image rm ${shellQuote(artifactCleanup.imageName)} >/dev/null 2>&1 || true`,
        cwd: workdir,
        env,
      });
      timeline.push(phaseLog("deploy", `Removed preview image ${artifactCleanup.imageName}`));
    }

    await this.report(context, {
      deploymentId: state.id.value,
      phase: "deploy",
      status: "succeeded",
      message: "Local deployment cancellation completed",
    });

    return ok({ timeline });
  }

  async rollback(
    context: ExecutionContext,
    deployment: Deployment,
    plan: RollbackPlan,
  ): Promise<Result<{ deployment: Deployment }>> {
    void plan;
    const state = deployment.toState();
    const metadata = state.runtimePlan.execution.metadata ?? {};
    const runtimeEnv = await resolveDependencyRuntimeEnvironment({
      context,
      deployment,
      dependencyResourceSecretStore: this.dependencyResourceSecretStore,
      includeDependencyRuntimeSecrets: false,
    });
    if (runtimeEnv.isErr()) {
      return err(runtimeEnv.error);
    }
    const { env } = runtimeEnv.value;
    const workdir =
      state.runtimePlan.execution.workingDirectory ?? normalizeWorkingDirectory(state.runtimePlan.source.locator);
    const timeline: DeploymentTimelineJournalEntry[] = [];
    const runtimeInstanceNames = deriveRuntimeInstanceNames({
      deploymentId: state.id.value,
      metadata: state.runtimePlan.execution.metadata,
    });

    try {
      await this.report(context, {
        deploymentId: state.id.value,
        phase: "rollback",
        status: "running",
        message: "Apply rollback plan",
      });
      switch (state.runtimePlan.execution.kind) {
        case "host-process":
          killProcess(metadata.pid);
          timeline.push(
            phaseLog(
              "rollback",
              metadata.pid ? `Stopped process ${metadata.pid}` : "No process id recorded",
            ),
          );
          break;
        case "docker-container":
          await runShellCommand({
            command: `docker rm -f ${metadata.containerName ?? runtimeInstanceNames.containerName}`,
            cwd: workdir,
            env,
          });
          timeline.push(
            phaseLog(
              "rollback",
              metadata.containerName
                ? `Removed container ${metadata.containerName}`
                : `Removed container ${runtimeInstanceNames.containerName}`,
            ),
          );
          break;
        case "docker-compose-stack":
          {
            const composeFile = metadata.composeFile ?? state.runtimePlan.execution.composeFile;
            const composeProjectName =
              metadata.composeProjectName ?? runtimeInstanceNames.composeProjectName;
            if (composeFile) {
              const composeProjectFlag = `-p ${shellQuote(composeProjectName)} `;
              await runShellCommand({
                command: `docker compose ${composeProjectFlag}-f ${shellQuote(composeFile)} down`,
                cwd: workdir,
                env,
              });
            }
            timeline.push(
              phaseLog(
                "rollback",
                composeFile
                  ? `Stopped compose stack ${composeFile}`
                  : "No compose metadata recorded",
              ),
            );
          }
          break;
      }

      deployment.applyExecutionResult(FinishedAt.rehydrate(new Date().toISOString()), ExecutionResult.rehydrate({
        exitCode: ExitCode.rehydrate(0),
        status: ExecutionStatusValue.rehydrate("rolled-back"),
        retryable: false,
        timeline,
      }));
      await this.report(context, {
        deploymentId: state.id.value,
        phase: "rollback",
        status: "succeeded",
        message: "Rollback completed",
      });

      return ok({ deployment });
    } catch (error) {
      await this.report(context, {
        deploymentId: state.id.value,
        phase: "rollback",
        status: "failed",
        level: "error",
        message: error instanceof Error ? error.message : "Unknown rollback error",
      });
      return ok({
        deployment: this.applyFailure(deployment, {
          timeline: [
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
