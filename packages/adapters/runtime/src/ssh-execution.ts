import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  deploymentProgressSteps,
  type AppLogger,
  type DeploymentExecutionGuard,
  type DeploymentProgressReporter,
  type EdgeProxyProviderRegistry,
  type ExecutionBackend,
  type ExecutionContext,
  type IntegrationAuthPort,
  type ResourceAccessFailureRendererTarget,
  type ServerRepository,
  reportDeploymentProgress,
  toRepositoryContext,
} from "@appaloft/application";
import {
  DeploymentLogEntry,
  DeploymentLogSourceValue,
  DeploymentPhaseValue,
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  ErrorCodeText,
  ExecutionResult,
  ExecutionStatusValue,
  ExitCode,
  FinishedAt,
  LogLevelValue,
  MessageText,
  OccurredAt,
  domainError,
  err,
  ok,
  type AccessRoute,
  type Deployment,
  type Result,
  type RuntimeExecutionPlan,
  type RuntimeVerificationStep,
  type RollbackPlan,
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
  dockerPublishedPortCommand,
  parseDockerPublishedHostPort,
  appaloftDockerContainerLabelsForDeployment,
} from "./docker-container-commands";
import { deriveRuntimeInstanceNames } from "./runtime-instance-names";
import {
  RuntimeCommandBuilder,
  dockerLabelsFromAssignments,
  renderRuntimeCommandString,
} from "./runtime-commands";
import { runStreamingProcess } from "./streaming-process";
import { generateStaticSiteDockerfile, generateWorkspaceDockerfile } from "./workspace-planners";

type LogPhase = "detect" | "plan" | "package" | "deploy" | "verify" | "rollback";
type LogLevel = "debug" | "info" | "warn" | "error";
type LogSource = "appaloft" | "application";

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

function sanitizeName(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
}

function shellQuote(input: string): string {
  return `'${input.replaceAll("'", "'\\''")}'`;
}

function redactSecrets(input: string, secrets: readonly string[] = []): string {
  return secrets.reduce(
    (text, secret) => (secret.length > 0 ? text.replaceAll(secret, "[redacted]") : text),
    input,
  );
}

function normalizeWorkingDirectory(locator: string): string {
  const resolved = resolve(locator);
  if (existsSync(resolved)) {
    return resolved;
  }

  return dirname(resolved);
}

function normalizeDockerImage(locator: string): string {
  return locator.replace(/^docker:\/\//, "").replace(/^image:\/\//, "");
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

function hasUrlCredentials(locator: string): boolean {
  try {
    const parsed = new URL(locator);
    return Boolean(parsed.username || parsed.password);
  } catch {
    return false;
  }
}

function isRemoteGitSourceKind(kind: string): boolean {
  return (
    kind === "remote-git" ||
    kind === "git-public" ||
    kind === "git-github-app" ||
    kind === "git-deploy-key"
  );
}

function isLocalWorkspaceSourceKind(kind: string): boolean {
  return kind === "local-folder" || kind === "local-git" || kind === "compose";
}

function sourceBaseDirectory(metadata?: Record<string, string>): string | undefined {
  const baseDirectory = metadata?.baseDirectory?.replace(/^\/+/, "").replace(/\/+$/, "");
  return baseDirectory ? baseDirectory : undefined;
}

function localSourceWorkdir(root: string, metadata?: Record<string, string>): string {
  const baseDirectory = sourceBaseDirectory(metadata);
  return baseDirectory ? resolve(root, baseDirectory) : root;
}

function remoteSourceWorkdir(root: string, metadata?: Record<string, string>): string {
  const baseDirectory = sourceBaseDirectory(metadata);
  return baseDirectory ? `${root}/${baseDirectory}` : root;
}

function hostWithUsername(host: string, username?: string): string {
  return username && !host.includes("@") ? `${username}@${host}` : host;
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

function normalizeHealthCheckPath(path: string | undefined): string {
  if (!path || path === "/") {
    return "/";
  }

  return path.startsWith("/") ? path : `/${path}`;
}

function joinRouteAndHealthPath(pathPrefix: string, healthPath: string): string {
  const normalizedPrefix = pathPrefix === "/" ? "" : pathPrefix.replace(/\/+$/, "");
  const normalizedHealthPath = normalizeHealthCheckPath(healthPath);

  if (!normalizedPrefix) {
    return normalizedHealthPath;
  }

  return normalizedHealthPath === "/" ? normalizedPrefix : `${normalizedPrefix}${normalizedHealthPath}`;
}

function publicHealthUrl(input: {
  route: AccessRoute;
  healthPath: string;
  publicHost: string;
  port: number;
}): string {
  if (input.route.proxyKind === "none") {
    const path = joinRouteAndHealthPath(input.route.pathPrefix, input.healthPath);
    return `http://${input.publicHost}:${input.route.targetPort ?? input.port}${path}`;
  }

  const scheme = input.route.tlsMode === "auto" ? "https" : "http";
  const domain = input.route.domains[0] ?? "localhost";
  const path = joinRouteAndHealthPath(input.route.pathPrefix, input.healthPath);

  return `${scheme}://${domain}${path}`;
}

function defaultVerificationSteps(accessRoutes: AccessRoute[]): Array<RuntimeVerificationStep["kind"]> {
  return accessRoutes.length > 0 ? ["internal-http", "public-http"] : ["internal-http"];
}

function remoteInternalHealthCheckCommand(url: string, options: HttpHealthCheckOptions): string {
  const timeoutSeconds = Math.max(1, Math.ceil(options.timeoutMs / 1000));
  const curlScript = [
    "command -v curl >/dev/null 2>&1",
    "body_file=$(mktemp)",
    'trap \'rm -f "$body_file"\' EXIT',
    [
      "code=$(curl",
      `--request ${shellQuote(options.method)}`,
      "--silent --show-error",
      `--max-time ${timeoutSeconds}`,
      '--output "$body_file"',
      '--write-out "%{http_code}"',
      shellQuote(url),
      ")",
    ].join(" "),
    `test "$code" = ${shellQuote(String(options.expectedStatusCode))}`,
    ...(options.expectedResponseText
      ? [`grep -F -- ${shellQuote(options.expectedResponseText)} "$body_file" >/dev/null`]
      : []),
  ].join(" && ");
  const wgetFallback =
    options.method === "GET" &&
    options.expectedStatusCode === 200 &&
    !options.expectedResponseText
      ? ` || (command -v wget >/dev/null 2>&1 && wget -q --timeout=${timeoutSeconds} --tries=1 -O /dev/null ${shellQuote(url)})`
      : "";

  return `(sh -lc ${shellQuote(curlScript)})${wgetFallback}`;
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

function runSyncShell(input: {
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

function deploymentEnv(deployment: Deployment, port?: number): NodeJS.ProcessEnv {
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

function supersededDeploymentIdsForCleanup(input: {
  supersedesDeploymentId?: { value: string };
}): string[] {
  return input.supersedesDeploymentId ? [input.supersedesDeploymentId.value] : [];
}

interface SshTarget {
  host: string;
  publicHost: string;
  port: string;
  identityFile?: string;
}

interface PreparedSshSource {
  kind: "workspace" | "image";
  metadata: Record<string, string>;
  remoteWorkdir?: string;
  image?: string;
}

export class SshExecutionBackend implements ExecutionBackend {
  constructor(
    private readonly runtimeRoot: string,
    private readonly logger: AppLogger,
    private readonly progressReporter: DeploymentProgressReporter,
    private readonly integrationAuthPort?: IntegrationAuthPort,
    private readonly serverRepository?: ServerRepository,
    private readonly edgeProxyProviderRegistry?: EdgeProxyProviderRegistry,
    private readonly remoteRuntimeRoot = "/var/lib/appaloft/runtime",
    private readonly resourceAccessFailureRenderer?: () => ResourceAccessFailureRendererTarget | undefined,
    private readonly deploymentExecutionGuard?: DeploymentExecutionGuard,
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

  private runtimeDirectory(deploymentId: string): string {
    return resolve(this.runtimeRoot, "ssh-deployments", deploymentId);
  }

  private remoteRuntimeDirectory(deploymentId: string): string {
    return `${this.remoteRuntimeRoot.replace(/\/+$/, "")}/ssh-deployments/${sanitizeName(deploymentId)}`;
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
    for (const line of redactSecrets(input.output, input.redactions)
      .split(/\r?\n/)
      .map((outputLine) => outputLine.trim())
      .filter((outputLine) => outputLine.length > 0)
      .slice(0, 50)) {
      const level = classifyOutputLogLevel(line, input.level);
      this.report(input.context, {
        deploymentId: input.deploymentId,
        phase: input.phase,
        source: "application",
        level,
        message: line,
        stream: input.stream,
      });
      logs.push(phaseLog(input.phase, line, level, "application"));
    }
  }

  private pushStreamingCommandOutput(
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
    if (input.persistedCount >= 50) {
      return input.persistedCount;
    }

    this.report(input.context, {
      deploymentId: input.deploymentId,
      phase: input.phase,
      source: "application",
      level: input.level,
      message: input.line,
      stream: input.stream,
    });
    logs.push(phaseLog(input.phase, input.line, input.level, "application"));
    return input.persistedCount + 1;
  }

  private async ensureExecutionStillOwned(
    context: ExecutionContext,
    deployment: Deployment,
    input: { step: string },
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

  private createStreamingOutputSink(
    logs: DeploymentLogEntry[],
    input: {
      context: ExecutionContext;
      deploymentId: string;
      phase: LogPhase;
    },
  ): (line: string, level: LogLevel, stream: "stdout" | "stderr") => void {
    let stdoutCount = 0;
    let stderrCount = 0;

    return (line, level, stream) => {
      if (stream === "stdout") {
        stdoutCount = this.pushStreamingCommandOutput(logs, {
          context: input.context,
          deploymentId: input.deploymentId,
          phase: input.phase,
          line,
          level,
          stream,
          persistedCount: stdoutCount,
        });
        return;
      }

      stderrCount = this.pushStreamingCommandOutput(logs, {
        context: input.context,
        deploymentId: input.deploymentId,
        phase: input.phase,
        line,
        level,
        stream,
        persistedCount: stderrCount,
      });
    };
  }

  private applyFailure(
    deployment: Deployment,
    input: {
      logs: DeploymentLogEntry[];
      errorCode: string;
      retryable?: boolean;
      metadata?: Record<string, string>;
    },
  ): Deployment {
    deployment.applyExecutionResult(
      FinishedAt.rehydrate(new Date().toISOString()),
      ExecutionResult.rehydrate({
        exitCode: ExitCode.rehydrate(1),
        status: ExecutionStatusValue.rehydrate("failed"),
        logs: input.logs,
        retryable: input.retryable ?? false,
        errorCode: ErrorCodeText.rehydrate(input.errorCode),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      }),
    );
    return deployment;
  }

  private pushRemoteDockerContainerDiagnostics(
    logs: DeploymentLogEntry[],
    input: {
      context: ExecutionContext;
      deploymentId: string;
      target: SshTarget;
      runtimeDir: string;
      env: NodeJS.ProcessEnv;
      containerName: string;
    },
  ): void {
    const format =
      "status={{.State.Status}} exitCode={{.State.ExitCode}} error={{.State.Error}} oomKilled={{.State.OOMKilled}} finishedAt={{.State.FinishedAt}}";
    const inspectMessage = `Inspect SSH Docker container ${input.containerName}`;
    logs.push(phaseLog("verify", inspectMessage));
    this.report(input.context, {
      deploymentId: input.deploymentId,
      phase: "verify",
      status: "running",
      message: inspectMessage,
    });

    const inspect = this.runRemoteCommand({
      target: input.target,
      command: `docker inspect --format ${shellQuote(format)} ${shellQuote(input.containerName)}`,
      cwd: input.runtimeDir,
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

    const logsMessage = `Capture SSH Docker logs for ${input.containerName}`;
    logs.push(phaseLog("verify", logsMessage));
    this.report(input.context, {
      deploymentId: input.deploymentId,
      phase: "verify",
      status: "running",
      message: logsMessage,
    });

    const dockerLogs = this.runRemoteCommand({
      target: input.target,
      command: `docker logs --tail 50 ${shellQuote(input.containerName)}`,
      cwd: input.runtimeDir,
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
          `SSH Docker inspect did not return diagnostics for ${input.containerName}`,
          "warn",
        ),
      );
    }

    if (dockerLogs.failed && !dockerLogs.stdout && !dockerLogs.stderr) {
      logs.push(
        phaseLog(
          "verify",
          `SSH Docker logs did not return application output for ${input.containerName}`,
          "warn",
        ),
      );
    }
  }

  private writePrivateKey(runtimeDir: string, privateKey: string): string {
    const sshDir = resolve(runtimeDir, "ssh");
    const identityFile = resolve(sshDir, "id_deployment_target");
    mkdirSync(sshDir, { recursive: true });
    writeFileSync(identityFile, privateKey.endsWith("\n") ? privateKey : `${privateKey}\n`, {
      mode: 0o600,
    });
    chmodSync(identityFile, 0o600);
    return identityFile;
  }

  private cleanupPrivateKey(target: SshTarget): void {
    if (target.identityFile) {
      rmSync(dirname(target.identityFile), { recursive: true, force: true });
    }
  }

  private async targetFor(
    context: ExecutionContext,
    deployment: Deployment,
    runtimeDir: string,
  ): Promise<Result<SshTarget>> {
    const state = deployment.toState();
    const planTarget = state.runtimePlan.target;
    const metadata = planTarget.metadata ?? {};
    let host = metadata.serverHost;
    let port = metadata.serverPort ?? "22";
    let username: string | undefined;
    let identityFile: string | undefined;

    const serverId = planTarget.serverIds[0];
    if (this.serverRepository && serverId) {
      const server = await this.serverRepository.findOne(
        toRepositoryContext(context),
        DeploymentTargetByIdSpec.create(DeploymentTargetId.rehydrate(serverId)),
      );
      const serverState = server?.toState();

      if (serverState) {
        host = serverState.host.value;
        port = String(serverState.port.value);
        username = serverState.credential?.username?.value;
        if (
          serverState.credential?.kind.value === "ssh-private-key" &&
          serverState.credential.privateKey
        ) {
          identityFile = this.writePrivateKey(runtimeDir, serverState.credential.privateKey.value);
        }
      }
    }

    if (!host) {
      return err(domainError.validation("SSH deployment target is missing server host metadata"));
    }

    return ok({
      host: hostWithUsername(host, username),
      publicHost: host,
      port,
      ...(identityFile ? { identityFile } : {}),
    });
  }

  private sshArgs(target: SshTarget): string[] {
    return [
      "-p",
      target.port,
      ...(target.identityFile
        ? ["-i", target.identityFile, "-o", "IdentitiesOnly=yes"]
        : []),
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=accept-new",
      target.host,
    ];
  }

  private runRemoteCommand(input: {
    target: SshTarget;
    command: string;
    cwd: string;
    env: NodeJS.ProcessEnv;
  }) {
    return runSyncProcess({
      command: "ssh",
      args: [...this.sshArgs(input.target), input.command],
      cwd: input.cwd,
      env: input.env,
    });
  }

  private async runRemoteCommandStreaming(input: {
    target: SshTarget;
    command: string;
    cwd: string;
    env: NodeJS.ProcessEnv;
    redactions?: readonly string[];
    onOutput(line: string, level: LogLevel, stream: "stdout" | "stderr"): void;
  }) {
    return await runStreamingProcess({
      command: "ssh",
      args: [...this.sshArgs(input.target), input.command],
      cwd: input.cwd,
      env: input.env,
      ...(input.redactions ? { redactions: input.redactions } : {}),
      onOutput: input.onOutput,
    });
  }

  private async waitForRemoteInternalHealth(input: {
    target: SshTarget;
    url: string;
    options: HttpHealthCheckOptions;
    cwd: string;
    env: NodeJS.ProcessEnv;
  }): Promise<{ ok: boolean; reason?: string; stdout: string; stderr: string }> {
    let lastFailure = "health check timed out";
    let lastStdout = "";
    let lastStderr = "";

    if (input.options.startPeriodMs > 0) {
      await Bun.sleep(input.options.startPeriodMs);
    }

    for (let attempt = 0; attempt < input.options.retries; attempt += 1) {
      const result = this.runRemoteCommand({
        target: input.target,
        command: remoteInternalHealthCheckCommand(input.url, input.options),
        cwd: input.cwd,
        env: input.env,
      });
      lastStdout = result.stdout;
      lastStderr = result.stderr;

      if (!result.failed) {
        return { ok: true, stdout: result.stdout, stderr: result.stderr };
      }

      lastFailure =
        result.stderr.trim() ||
        result.stdout.trim() ||
        result.reason ||
        `remote command exited with ${result.exitCode}`;

      if (attempt < input.options.retries - 1) {
        await Bun.sleep(input.options.intervalMs);
      }
    }

    return {
      ok: false,
      reason: lastFailure,
      stdout: lastStdout,
      stderr: lastStderr,
    };
  }

  private async prepareSshSource(
    context: ExecutionContext,
    deployment: Deployment,
    logs: DeploymentLogEntry[],
    input: {
      runtimeDir: string;
      remoteRoot: string;
      target: SshTarget;
      env: NodeJS.ProcessEnv;
    },
  ): Promise<
    | { prepared: true; source: PreparedSshSource }
    | { prepared: false; deployment: Deployment }
  > {
    const state = deployment.toState();
    const source = state.runtimePlan.source;

    if (state.runtimePlan.buildStrategy === "prebuilt-image" || source.kind === "docker-image") {
      return {
        prepared: true,
        source: {
          kind: "image",
          image: state.runtimePlan.execution.image ?? normalizeDockerImage(source.locator),
          metadata: {
            sourceStrategy: "prebuilt-image",
          },
        },
      };
    }

    const remoteSourceRoot = `${input.remoteRoot}/source`;
    const remoteWorkdir = remoteSourceWorkdir(remoteSourceRoot, source.metadata);

    if (isRemoteGitSourceKind(source.kind)) {
      if (source.kind === "git-public" && hasUrlCredentials(source.locator)) {
        const message = "Public git source cannot include embedded credentials";
        logs.push(phaseLog("package", message, "error"));
        return {
          prepared: false,
          deployment: this.applyFailure(deployment, {
            logs,
            errorCode: "git_public_credentials_not_allowed",
            retryable: false,
            metadata: {
              source: source.locator,
            },
          }),
        };
      }

      let cloneLocator = source.locator;
      const redactions: string[] = [];
      let setupCommand = "";
      let cloneEnv = "";

      if (source.kind === "git-github-app") {
        if (!isGitHubHttpsLocator(source.locator)) {
          const message = "GitHub App source requires a GitHub HTTPS repository URL";
          logs.push(phaseLog("package", message, "error"));
          return {
            prepared: false,
            deployment: this.applyFailure(deployment, {
              logs,
              errorCode: "github_app_source_requires_github_https",
              retryable: false,
              metadata: {
                source: source.locator,
              },
            }),
          };
        }

        const accessToken = await this.integrationAuthPort?.getProviderAccessToken(
          context,
          "github",
        );
        if (!accessToken) {
          const message = "GitHub App source requires a connected GitHub access token";
          logs.push(phaseLog("package", message, "error"));
          return {
            prepared: false,
            deployment: this.applyFailure(deployment, {
              logs,
              errorCode: "github_app_access_token_missing",
              retryable: false,
              metadata: {
                source: source.locator,
              },
            }),
          };
        }

        cloneLocator = withGitHubAccessToken(source.locator, accessToken);
        redactions.push(accessToken, cloneLocator);
      }

      if (source.kind === "git-deploy-key") {
        const deployKeyPath = source.metadata?.deployKeyPath;
        if (!deployKeyPath) {
          const message = "Deploy key source requires deployKeyPath metadata";
          logs.push(phaseLog("package", message, "error"));
          return {
            prepared: false,
            deployment: this.applyFailure(deployment, {
              logs,
              errorCode: "git_deploy_key_missing",
              retryable: false,
              metadata: {
                source: source.locator,
              },
            }),
          };
        }

        const deployKeyPrivateKey = readFileSync(deployKeyPath, "utf8");
        const remoteDeployKeyPath = `${input.remoteRoot}/.ssh/git_deploy_key`;
        const normalizedKey = deployKeyPrivateKey.endsWith("\n")
          ? deployKeyPrivateKey
          : `${deployKeyPrivateKey}\n`;
        const encodedKey = Buffer.from(normalizedKey, "utf8").toString("base64");
        setupCommand = [
          `mkdir -p ${shellQuote(`${input.remoteRoot}/.ssh`)}`,
          `install -m 600 /dev/null ${shellQuote(remoteDeployKeyPath)}`,
          `printf %s ${shellQuote(encodedKey)} | base64 -d > ${shellQuote(remoteDeployKeyPath)}`,
          `chmod 600 ${shellQuote(remoteDeployKeyPath)}`,
        ].join(" && ");
        cloneEnv = `GIT_SSH_COMMAND=${shellQuote(
          `ssh -i ${remoteDeployKeyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`,
        )}`;
        redactions.push(deployKeyPrivateKey, normalizedKey, encodedKey);
      }

      logs.push(
        phaseLog("package", `Clone git source on ${input.target.host}:${remoteSourceRoot}`),
      );
      this.report(context, {
        deploymentId: state.id.value,
        phase: "package",
        status: "running",
        message: `Clone git source ${source.displayName} on target`,
      });
      const branchOption = source.metadata?.gitRef
        ? `--branch ${shellQuote(source.metadata.gitRef)} `
        : "";
      const cloneCommand = [
        `rm -rf ${shellQuote(remoteSourceRoot)}`,
        `mkdir -p ${shellQuote(remoteSourceRoot)}`,
        ...(setupCommand ? [setupCommand] : []),
        `${cloneEnv} git clone --depth 1 ${branchOption}${shellQuote(cloneLocator)} ${shellQuote(remoteSourceRoot)}`.trim(),
      ].join(" && ");
      let cloneStdoutCount = 0;
      let cloneStderrCount = 0;
      const clone = await this.runRemoteCommandStreaming({
        target: input.target,
        command: cloneCommand,
        cwd: input.runtimeDir,
        env: input.env,
        redactions,
        onOutput: (line, level, stream) => {
          if (stream === "stdout") {
            cloneStdoutCount = this.pushStreamingCommandOutput(logs, {
              context,
              deploymentId: state.id.value,
              phase: "package",
              line,
              level,
              stream,
              persistedCount: cloneStdoutCount,
            });
            return;
          }

          cloneStderrCount = this.pushStreamingCommandOutput(logs, {
            context,
            deploymentId: state.id.value,
            phase: "package",
            line,
            level,
            stream,
            persistedCount: cloneStderrCount,
          });
        },
      });

      if (clone.failed) {
        const message = clone.reason
          ? `Remote git clone failed: ${clone.reason}`
          : `Remote git clone failed with exit code ${clone.exitCode}`;
        logs.push(phaseLog("package", message, "error"));
        return {
          prepared: false,
          deployment: this.applyFailure(deployment, {
            logs,
            errorCode: "remote_git_clone_failed",
            retryable: true,
            metadata: {
              source: source.locator,
              remoteWorkdir: remoteSourceRoot,
            },
          }),
        };
      }

      const commit = this.runRemoteCommand({
        target: input.target,
        command: `git -C ${shellQuote(remoteSourceRoot)} rev-parse --verify HEAD`,
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
        logs.push(phaseLog("package", message, "error"));
        return {
          prepared: false,
          deployment: this.applyFailure(deployment, {
            logs,
            errorCode: "remote_git_commit_resolution_failed",
            retryable: true,
            metadata: {
              phase: "package",
              source: source.locator,
              remoteWorkdir: remoteSourceRoot,
            },
          }),
        };
      }

      const commitMessage = `Resolved git commit ${shortGitCommitSha(commitSha)}`;
      logs.push(phaseLog("package", commitMessage));
      this.report(context, {
        deploymentId: state.id.value,
        phase: "package",
        status: "running",
        message: commitMessage,
      });

      this.report(context, {
        deploymentId: state.id.value,
        phase: "package",
        status: "succeeded",
        message: `Target git source workspace is ready at ${shortGitCommitSha(commitSha)}`,
      });

      return {
        prepared: true,
        source: {
          kind: "workspace",
          remoteWorkdir,
          metadata: {
            sourceStrategy: source.kind,
            remoteWorkdir,
            [sourceCommitShaMetadataKey]: commitSha,
            ...(source.metadata?.gitRef ? { gitRef: source.metadata.gitRef } : {}),
            ...(source.metadata?.baseDirectory
              ? { baseDirectory: source.metadata.baseDirectory }
              : {}),
          },
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
          }),
        };
      }

      const targetFile =
        source.kind === "dockerfile-inline"
          ? (source.metadata?.dockerfilePath ?? "Dockerfile")
          : (source.metadata?.composeFilePath ?? "docker-compose.yml");
      const remoteTargetFile = `${remoteSourceRoot}/${targetFile}`;
      logs.push(phaseLog("package", `Write ${source.kind} source to ${remoteTargetFile}`));
      this.report(context, {
        deploymentId: state.id.value,
        phase: "package",
        status: "running",
        message: `Write ${source.kind} source on target`,
      });
      const writeInlineSource = this.runRemoteCommand({
        target: input.target,
        command: [
          `rm -rf ${shellQuote(remoteSourceRoot)}`,
          `mkdir -p ${shellQuote(remoteSourceRoot)}`,
          `mkdir -p "$(dirname ${shellQuote(remoteTargetFile)})"`,
          `printf %s ${shellQuote(
            Buffer.from(content.endsWith("\n") ? content : `${content}\n`, "utf8").toString(
              "base64",
            ),
          )} | base64 -d > ${shellQuote(remoteTargetFile)}`,
        ].join(" && "),
        cwd: input.runtimeDir,
        env: input.env,
      });

      if (writeInlineSource.failed) {
        const message = writeInlineSource.reason
          ? `Inline source write failed: ${writeInlineSource.reason}`
          : `Inline source write failed with exit code ${writeInlineSource.exitCode}`;
        logs.push(phaseLog("package", message, "error"));
        return {
          prepared: false,
          deployment: this.applyFailure(deployment, {
            logs,
            errorCode: "inline_source_write_failed",
            retryable: true,
            metadata: {
            remoteWorkdir: remoteSourceRoot,
              remoteTargetFile,
            },
          }),
        };
      }

      this.report(context, {
        deploymentId: state.id.value,
        phase: "package",
        status: "succeeded",
        message: "Target inline source workspace is ready",
      });

      return {
        prepared: true,
        source: {
          kind: "workspace",
          remoteWorkdir,
          metadata: {
            sourceStrategy: source.kind,
            remoteWorkdir,
            remoteTargetFile,
          },
        },
      };
    }

    if (!isLocalWorkspaceSourceKind(source.kind)) {
      const message = `SSH source kind is not supported: ${source.kind}`;
      logs.push(phaseLog("package", message, "error"));
      return {
        prepared: false,
        deployment: this.applyFailure(deployment, {
          logs,
          errorCode: "ssh_source_kind_unsupported",
          retryable: false,
          metadata: {
            source: source.locator,
            sourceKind: source.kind,
          },
        }),
      };
    }

    const localWorkdir = localSourceWorkdir(
      state.runtimePlan.execution.workingDirectory ?? normalizeWorkingDirectory(source.locator),
      source.metadata,
    );

    if (!existsSync(localWorkdir)) {
      const message = `Source working directory does not exist: ${localWorkdir}`;
      logs.push(phaseLog("package", message, "error"));
      return {
        prepared: false,
        deployment: this.applyFailure(deployment, {
          logs,
          errorCode: "source_workdir_missing",
          retryable: false,
          metadata: {
            localWorkdir,
          },
        }),
      };
    }

    logs.push(
      phaseLog("package", `Upload source workspace to ${input.target.host}:${remoteWorkdir}`),
    );
    this.report(context, {
      deploymentId: state.id.value,
      phase: "package",
      status: "running",
      message: "Upload source workspace over SSH",
    });
    const remotePrepareCommand = `rm -rf ${shellQuote(remoteWorkdir)} && mkdir -p ${shellQuote(remoteWorkdir)} && tar -xzf - -C ${shellQuote(remoteWorkdir)}`;
    const uploadCommand = [
      "tar",
      "-czf",
      "-",
      "-C",
      shellQuote(localWorkdir),
      ".",
      "|",
      "ssh",
      ...this.sshArgs(input.target).map((arg) => shellQuote(arg)),
      shellQuote(remotePrepareCommand),
    ].join(" ");
    const upload = runSyncShell({
      command: uploadCommand,
      cwd: input.runtimeDir,
      env: input.env,
    });
    this.pushCommandOutput(logs, {
      context,
      deploymentId: state.id.value,
      phase: "package",
      output: upload.stderr,
      level: "warn",
      stream: "stderr",
    });

    if (upload.failed) {
      const message = upload.reason
        ? `Source upload failed: ${upload.reason}`
        : `Source upload failed with exit code ${upload.exitCode}`;
      logs.push(phaseLog("package", message, "error"));
      return {
        prepared: false,
        deployment: this.applyFailure(deployment, {
          logs,
          errorCode: "ssh_source_upload_failed",
          retryable: true,
          metadata: {
            localWorkdir,
            remoteWorkdir,
          },
        }),
      };
    }

    this.report(context, {
      deploymentId: state.id.value,
      phase: "package",
      status: "succeeded",
      message: "Remote source workspace is ready",
    });

    return {
      prepared: true,
      source: {
        kind: "workspace",
        remoteWorkdir,
        metadata: {
          sourceStrategy: source.kind === "remote-git" ? "remote-git" : "local-workspace",
          remoteWorkdir,
          ...(source.metadata?.baseDirectory
            ? { baseDirectory: source.metadata.baseDirectory }
            : {}),
        },
      },
    };
  }

  async execute(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    const state = deployment.toState();

    if (state.runtimePlan.execution.kind === "docker-compose-stack") {
      return this.executeDockerCompose(context, deployment);
    }

    if (state.runtimePlan.execution.kind !== "docker-container") {
      return err(
        domainError.validation(
          `SSH execution currently supports docker-container plans only, got ${state.runtimePlan.execution.kind}`,
        ),
      );
    }

    const runtimeDir = this.runtimeDirectory(state.id.value);
    mkdirSync(runtimeDir, { recursive: true });

    const targetResult = await this.targetFor(context, deployment, runtimeDir);
    if (targetResult.isErr()) {
      return targetResult.map(() => ({ deployment }));
    }
    const target = targetResult._unsafeUnwrap();
    const remoteRoot = this.remoteRuntimeDirectory(state.id.value);

    const port = state.runtimePlan.execution.port ?? 3000;
    const env = deploymentEnv(deployment, port);
    const logs: DeploymentLogEntry[] = [
      phaseLog("plan", `Using SSH docker-container execution on ${target.host}:${target.port}`),
    ];

    try {
      const prepared = await this.prepareSshSource(context, deployment, logs, {
        runtimeDir,
        remoteRoot,
        target,
        env,
      });

      if (!prepared.prepared) {
        return ok({ deployment: prepared.deployment });
      }

      const dockerVersion = this.runRemoteCommand({
        target,
        command: "docker version --format '{{.Server.Version}}'",
        cwd: runtimeDir,
        env,
      });

      if (dockerVersion.failed) {
        const message = "Docker is not available on the SSH target";
        logs.push(phaseLog("package", message, "error"));
        return ok({
          deployment: this.applyFailure(deployment, {
            logs,
            errorCode: "ssh_docker_unavailable",
            retryable: false,
            metadata: {
              host: target.host,
              ...prepared.source.metadata,
            },
          }),
        });
      }

      const runtimeInstanceNames = deriveRuntimeInstanceNames({
        deploymentId: state.id.value,
        metadata: state.runtimePlan.execution.metadata,
      });
      let image = prepared.source.image ?? state.runtimePlan.execution.image;
      const containerName = runtimeInstanceNames.containerName;

      const shouldBuildImage =
        state.runtimePlan.buildStrategy === "dockerfile" ||
        state.runtimePlan.buildStrategy === "workspace-commands" ||
        state.runtimePlan.buildStrategy === "static-artifact";

      if (shouldBuildImage) {
        image = runtimeInstanceNames.imageName;
        const remoteWorkdir = prepared.source.remoteWorkdir;
        if (!remoteWorkdir) {
          return err(domainError.validation("Dockerfile SSH deployment requires a remote workdir"));
        }

        const dockerfilePath =
          state.runtimePlan.buildStrategy === "dockerfile"
            ? (state.runtimePlan.execution.dockerfilePath ?? "Dockerfile")
            : `${remoteRoot}/${
                state.runtimePlan.execution.dockerfilePath ??
                (state.runtimePlan.buildStrategy === "static-artifact"
                  ? "Dockerfile.appaloft-static"
                  : "Dockerfile.appaloft")
              }`;

        if (state.runtimePlan.buildStrategy === "workspace-commands") {
          const dockerfile = generateWorkspaceDockerfile({
            execution: state.runtimePlan.execution,
            ...(state.runtimePlan.source.inspection
              ? { sourceInspection: state.runtimePlan.source.inspection }
              : {}),
          });
          if (!dockerfile) {
            const message = "Start command is required for workspace image generation";
            logs.push(phaseLog("package", message, "error"));
            return ok({
              deployment: this.applyFailure(deployment, {
                logs,
                errorCode: "workspace_start_command_missing",
                retryable: false,
                metadata: {
                  host: target.host,
                  remoteWorkdir,
                },
              }),
            });
          }

          const encodedDockerfile = Buffer.from(dockerfile, "utf8").toString("base64");
          const writeDockerfile = this.runRemoteCommand({
            target,
            command: [
              `mkdir -p ${shellQuote(remoteRoot)}`,
              `printf %s ${shellQuote(encodedDockerfile)} | base64 -d > ${shellQuote(dockerfilePath)}`,
            ].join(" && "),
            cwd: runtimeDir,
            env,
          });

          if (writeDockerfile.failed) {
            const message = "SSH workspace Dockerfile write failed";
            logs.push(phaseLog("package", message, "error"));
            return ok({
              deployment: this.applyFailure(deployment, {
                logs,
                errorCode: "ssh_workspace_dockerfile_write_failed",
                retryable: true,
                metadata: {
                  host: target.host,
                  remoteWorkdir,
                },
              }),
            });
          }
        }

        if (state.runtimePlan.buildStrategy === "static-artifact") {
          const dockerfile = generateStaticSiteDockerfile({
            execution: state.runtimePlan.execution,
            ...(state.runtimePlan.source.inspection
              ? { sourceInspection: state.runtimePlan.source.inspection }
              : {}),
          });
          if (!dockerfile) {
            const message = "Static publish directory is required for static image generation";
            logs.push(phaseLog("package", message, "error"));
            return ok({
              deployment: this.applyFailure(deployment, {
                logs,
                errorCode: "static_dockerfile_generation_failed",
                retryable: false,
                metadata: {
                  host: target.host,
                  remoteWorkdir,
                },
              }),
            });
          }

          const encodedDockerfile = Buffer.from(dockerfile, "utf8").toString("base64");
          const writeDockerfile = this.runRemoteCommand({
            target,
            command: [
              `mkdir -p ${shellQuote(remoteRoot)}`,
              `printf %s ${shellQuote(encodedDockerfile)} | base64 -d > ${shellQuote(dockerfilePath)}`,
            ].join(" && "),
            cwd: runtimeDir,
            env,
          });

          if (writeDockerfile.failed) {
            const message = "SSH static site Dockerfile write failed";
            logs.push(phaseLog("package", message, "error"));
            return ok({
              deployment: this.applyFailure(deployment, {
                logs,
                errorCode: "ssh_static_dockerfile_write_failed",
                retryable: true,
                metadata: {
                  host: target.host,
                  remoteWorkdir,
                },
              }),
            });
          }
          logs.push(
            phaseLog("package", `Generated static site Dockerfile at ${dockerfilePath}`),
          );
        }

        const buildCommand = renderRuntimeCommandString(
          RuntimeCommandBuilder.docker().buildImage({
            image,
            dockerfilePath,
            contextPath: ".",
            workingDirectory: remoteWorkdir,
          }),
          { quote: shellQuote },
        );
        logs.push(phaseLog("package", `Build Docker image ${image} on SSH target`));
        this.report(context, {
          deploymentId: state.id.value,
          phase: "package",
          status: "running",
          message: `Build image ${image}`,
        });
        let buildStdoutCount = 0;
        let buildStderrCount = 0;
        const build = await this.runRemoteCommandStreaming({
          target,
          command: buildCommand,
          cwd: runtimeDir,
          env,
          onOutput: (line, level, stream) => {
            if (stream === "stdout") {
              buildStdoutCount = this.pushStreamingCommandOutput(logs, {
                context,
                deploymentId: state.id.value,
                phase: "package",
                line,
                level,
                stream,
                persistedCount: buildStdoutCount,
              });
              return;
            }

            buildStderrCount = this.pushStreamingCommandOutput(logs, {
              context,
              deploymentId: state.id.value,
              phase: "package",
              line,
              level,
              stream,
              persistedCount: buildStderrCount,
            });
          },
        });

        if (build.failed) {
          const message = "SSH Docker image build failed";
          logs.push(phaseLog("package", message, "error"));
          return ok({
            deployment: this.applyFailure(deployment, {
              logs,
              errorCode: "ssh_docker_build_failed",
              retryable: true,
              metadata: {
                host: target.host,
                remoteWorkdir,
              },
            }),
          });
        }
      }

      if (!image) {
        return err(domainError.validation("Docker image is required for SSH docker execution"));
      }

      const deployOwnershipResult = await this.ensureExecutionStillOwned(context, deployment, {
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
        logs.push(phaseLog("deploy", message, "error"));
        return ok({
          deployment: this.applyFailure(deployment, {
            logs,
            errorCode: proxyBootstrapResult.error.code,
            retryable: proxyBootstrapResult.error.retryable,
            metadata: {
              host: target.host,
              ...prepared.source.metadata,
              message: proxyBootstrapResult.error.message,
            },
          }),
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

        const network = await this.runRemoteCommandStreaming({
          target,
          command: proxyBootstrap.networkCommand,
          cwd: runtimeDir,
          env,
          onOutput: this.createStreamingOutputSink(logs, {
            context,
            deploymentId: state.id.value,
            phase: "deploy",
          }),
        });

        const proxy = await this.runRemoteCommandStreaming({
          target,
          command: proxyBootstrap.containerCommand,
          cwd: runtimeDir,
          env,
          onOutput: this.createStreamingOutputSink(logs, {
            context,
            deploymentId: state.id.value,
            phase: "deploy",
          }),
        });

        if (network.failed || proxy.failed) {
          const failure = classifyEdgeProxyStartFailure({
            containerName: proxyBootstrap.containerName,
            defaultErrorCode: "ssh_edge_proxy_start_failed",
            defaultMessage: `${proxyBootstrap.displayName} edge proxy failed to start`,
            networkName: proxyBootstrap.networkName,
            output: `${network.stdout}\n${network.stderr}\n${proxy.stdout}\n${proxy.stderr}`,
            providerKey: proxyBootstrap.providerKey,
            proxyKind: proxyBootstrap.proxyKind,
          });
          const message = failure.message;
          logs.push(phaseLog("deploy", message, "error"));
          return ok({
            deployment: this.applyFailure(deployment, {
              logs,
              errorCode: failure.errorCode,
              retryable: failure.retryable,
              metadata: {
                host: target.host,
                ...prepared.source.metadata,
                ...failure.metadata,
              },
            }),
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

      const resourceAccessFailureRenderer = this.resourceAccessFailureRenderer?.();
      const proxyRoutePlanResult = this.edgeProxyProviderRegistry
        ? await createProxyRouteRealizationPlan({
            providerRegistry: this.edgeProxyProviderRegistry,
            context: {
              correlationId: context.requestId,
            },
            deploymentId: state.id.value,
            port,
            accessRoutes,
            ...(resourceAccessFailureRenderer ? { resourceAccessFailureRenderer } : {}),
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
              host: target.host,
              ...prepared.source.metadata,
              message: proxyRoutePlanResult.error.message,
              phase: "proxy-route-realization",
            },
          }),
        });
      }

      const dockerCommandBuilder = RuntimeCommandBuilder.docker();
      const dockerEnvVariables = Object.entries(env)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        .filter(
          ([key]) =>
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
        ...appaloftDockerContainerLabelsForDeployment(state),
        ...(proxyRoutePlanResult.value?.labels ?? []),
      ]);
      const usesDirectHostPort =
        state.runtimePlan.execution.metadata?.["resource.exposureMode"] === "direct-port";
      const supersededDeploymentIds = supersededDeploymentIdsForCleanup(state);
      const removeSupersededResourceContainersSpec =
        dockerCommandBuilder.removeResourceContainers({
          resourceId: state.resourceId.value,
          deploymentIds: supersededDeploymentIds,
        });
      const runCommandSpec = RuntimeCommandBuilder.sequence([
        dockerCommandBuilder.removeContainer({
          containerName,
          ignoreMissing: true,
        }),
        ...(usesDirectHostPort && supersededDeploymentIds.length > 0
          ? [removeSupersededResourceContainersSpec]
          : []),
        dockerCommandBuilder.runContainer({
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
              mode: usesDirectHostPort ? "host-same-port" : "loopback-ephemeral",
            }),
          ],
        }),
      ]);
      const runCommand = renderRuntimeCommandString(runCommandSpec, { quote: shellQuote });
      if (usesDirectHostPort && supersededDeploymentIds.length > 0) {
        logs.push(
          phaseLog(
            "deploy",
            `Release existing SSH containers for resource ${state.resourceId.value}`,
          ),
        );
      }
      logs.push(phaseLog("deploy", `Start SSH container ${containerName}`));
      const run = await this.runRemoteCommandStreaming({
        target,
        command: runCommand,
        cwd: runtimeDir,
        env,
        onOutput: this.createStreamingOutputSink(logs, {
          context,
          deploymentId: state.id.value,
          phase: "deploy",
        }),
      });

      if (run.failed) {
        const message = "SSH Docker container failed to start";
        logs.push(phaseLog("deploy", message, "error"));
        return ok({
          deployment: this.applyFailure(deployment, {
            logs,
            errorCode: "ssh_docker_run_failed",
            retryable: true,
            metadata: {
              host: target.host,
              image,
              containerName,
              ...prepared.source.metadata,
            },
          }),
        });
      }

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
        const message = "SSH edge proxy reload plan could not be rendered";
        logs.push(phaseLog("deploy", message, "error"));
        return ok({
          deployment: this.applyFailure(deployment, {
            logs,
            errorCode: proxyReloadPlanResult.error.code,
            retryable: proxyReloadPlanResult.error.retryable,
            metadata: {
              host: target.host,
              ...prepared.source.metadata,
              message: proxyReloadPlanResult.error.message,
              phase: "proxy-reload",
            },
          }),
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
            this.runRemoteCommand({
              target,
              command: step.command ?? "",
              cwd: runtimeDir,
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
                host: target.host,
                ...prepared.source.metadata,
                providerKey: proxyReloadPlan.providerKey,
                proxyKind: proxyReloadPlan.proxyKind,
                stepName: reload.stepName,
                phase: "proxy-reload",
              },
            }),
          });
        }

        this.report(context, {
          deploymentId: state.id.value,
          phase: "deploy",
          status: "succeeded",
          message: `${proxyReloadPlan.displayName} edge proxy reload is complete`,
        });
      }

      const publishedPortResult = this.runRemoteCommand({
        target,
        command: dockerPublishedPortCommand({
          containerName,
          containerPort: port,
          quote: shellQuote,
        }),
        cwd: runtimeDir,
        env,
      });
      const publishedHostPort = parseDockerPublishedHostPort(publishedPortResult.stdout);

      if (publishedPortResult.failed || publishedHostPort === undefined) {
        this.pushRemoteDockerContainerDiagnostics(logs, {
          context,
          deploymentId: state.id.value,
          target,
          runtimeDir,
          env,
          containerName,
        });
        this.runRemoteCommand({
          target,
          command: `docker rm -f ${shellQuote(containerName)}`,
          cwd: runtimeDir,
          env,
        });
        const message = `SSH Docker published port could not be resolved for ${containerName}`;
        logs.push(phaseLog("verify", message, "error"));
        return ok({
          deployment: this.applyFailure(deployment, {
            logs,
            errorCode: "ssh_docker_published_port_resolution_failed",
            retryable: true,
            metadata: {
              host: target.host,
              image,
              containerName,
              port: String(port),
              ...prepared.source.metadata,
            },
          }),
        });
      }

      const healthPath = normalizeHealthCheckPath(
        state.runtimePlan.execution.healthCheck?.http?.path.value ??
          state.runtimePlan.execution.healthCheckPath,
      );
      const verificationSteps =
        state.runtimePlan.execution.verificationSteps.length > 0
          ? state.runtimePlan.execution.verificationSteps.map((step) => step.kind)
          : defaultVerificationSteps(accessRoutes);
      const internalUrl = `http://127.0.0.1:${publishedHostPort}${healthPath}`;
      const publicUrls = accessRoutes.map((route) =>
        publicHealthUrl({ route, healthPath, publicHost: target.publicHost, port }),
      );
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
              host: target.host,
              image,
              containerName,
              port: String(port),
              publishedPort: String(publishedHostPort),
              ...prepared.source.metadata,
            },
          }),
        );
        return ok({ deployment });
      }

      for (const step of verificationSteps) {
        if (step === "internal-http") {
          this.report(context, {
            deploymentId: state.id.value,
            phase: "verify",
            status: "running",
            message: `Checking remote internal container health at ${internalUrl}`,
          });
          const internalHealth = await this.waitForRemoteInternalHealth({
            target,
            url: internalUrl,
            options: healthOptions,
            cwd: runtimeDir,
            env,
          });
          this.pushCommandOutput(logs, {
            context,
            deploymentId: state.id.value,
            phase: "verify",
            output: internalHealth.stdout,
            level: internalHealth.ok ? "info" : "warn",
            stream: "stdout",
          });
          this.pushCommandOutput(logs, {
            context,
            deploymentId: state.id.value,
            phase: "verify",
            output: internalHealth.stderr,
            level: "warn",
            stream: "stderr",
          });

          if (!internalHealth.ok) {
            this.pushRemoteDockerContainerDiagnostics(logs, {
              context,
              deploymentId: state.id.value,
              target,
              runtimeDir,
              env,
              containerName,
            });
            this.runRemoteCommand({
              target,
              command: `docker rm -f ${shellQuote(containerName)}`,
              cwd: runtimeDir,
              env,
            });
            const message = `SSH internal container health check failed for ${internalUrl}${
              internalHealth.reason ? `: ${internalHealth.reason}` : ""
            }`;
            logs.push(phaseLog("verify", message, "error"));
            return ok({
              deployment: this.applyFailure(deployment, {
                logs,
                errorCode: "ssh_internal_health_check_failed",
                retryable: true,
                metadata: {
                  host: target.host,
                  image,
                  containerName,
                  port: String(port),
                  publishedPort: String(publishedHostPort),
                  url: internalUrl,
                  ...prepared.source.metadata,
                },
              }),
            });
          }

          logs.push(
            phaseLog("verify", `SSH container is reachable internally at ${internalUrl}`),
          );
          continue;
        }

        if (step === "public-http") {
          if (publicUrls.length === 0) {
            const message = "SSH public route health check requested without access routes";
            logs.push(phaseLog("verify", message, "error"));
            return ok({
              deployment: this.applyFailure(deployment, {
                logs,
                errorCode: "ssh_public_route_missing",
                retryable: false,
                metadata: {
                  host: target.host,
                  image,
                  containerName,
                  port: String(port),
                  publishedPort: String(publishedHostPort),
                  internalUrl,
                  phase: "public-route-verification",
                  ...prepared.source.metadata,
                },
              }),
            });
          }

          for (const publicUrl of publicUrls) {
            this.report(context, {
              deploymentId: state.id.value,
              phase: "verify",
              status: "running",
              message: `Checking public access route ${publicUrl}`,
            });
            const publicHealth = await waitForHealth(publicUrl, healthOptions);

            if (!publicHealth.ok) {
              this.pushRemoteDockerContainerDiagnostics(logs, {
                context,
                deploymentId: state.id.value,
                target,
                runtimeDir,
                env,
                containerName,
              });
              this.runRemoteCommand({
                target,
                command: `docker rm -f ${shellQuote(containerName)}`,
                cwd: runtimeDir,
                env,
              });
              const message = `SSH public route health check failed for ${publicUrl}${
                publicHealth.reason ? `: ${publicHealth.reason}` : ""
              }`;
              logs.push(phaseLog("verify", message, "error"));
              return ok({
                deployment: this.applyFailure(deployment, {
                  logs,
                  errorCode: "ssh_public_route_health_check_failed",
                  retryable: true,
                  metadata: {
                    host: target.host,
                    image,
                    containerName,
                    port: String(port),
                    publishedPort: String(publishedHostPort),
                    internalUrl,
                    url: publicUrl,
                    phase: "public-route-verification",
                    ...prepared.source.metadata,
                  },
                }),
              });
            }

            logs.push(phaseLog("verify", `SSH public route is reachable at ${publicUrl}`));
          }
        }
      }

      if (!usesDirectHostPort && supersededDeploymentIds.length > 0) {
        const cleanupCommand = renderRuntimeCommandString(removeSupersededResourceContainersSpec, {
          quote: shellQuote,
        });
        const cleanup = this.runRemoteCommand({
          target,
          command: cleanupCommand,
          cwd: runtimeDir,
          env,
        });
        logs.push(
          phaseLog(
            "deploy",
            cleanup.failed
              ? `Failed to release superseded SSH containers for resource ${state.resourceId.value}`
              : `Released superseded SSH containers for resource ${state.resourceId.value}`,
            cleanup.failed ? "warn" : "info",
          ),
        );
      }

      deployment.applyExecutionResult(
        FinishedAt.rehydrate(new Date().toISOString()),
        ExecutionResult.rehydrate({
          exitCode: ExitCode.rehydrate(0),
          status: ExecutionStatusValue.rehydrate("succeeded"),
          retryable: false,
          logs,
          metadata: {
            host: target.host,
            image,
            containerName,
            port: String(port),
            publishedPort: String(publishedHostPort),
            url: publicUrls[0] ?? internalUrl,
            internalUrl,
            ...(publicUrls.length > 0 ? { publicUrl: publicUrls[0] } : {}),
            ...prepared.source.metadata,
          },
        }),
      );

      return ok({ deployment });
    } catch (error) {
      if (context.entrypoint !== "cli") {
        this.logger.error("ssh_execution_backend.execute_failed", {
          deploymentId: state.id.value,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return ok({
        deployment: this.applyFailure(deployment, {
          logs: [
            phaseLog(
              "deploy",
              error instanceof Error ? error.message : "Unknown SSH execution error",
              "error",
            ),
          ],
          errorCode: "ssh_execution_failed",
          retryable: true,
        }),
      });
    } finally {
      this.cleanupPrivateKey(target);
    }
  }

  private async executeDockerCompose(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    const state = deployment.toState();
    const runtimeDir = this.runtimeDirectory(state.id.value);
    mkdirSync(runtimeDir, { recursive: true });

    const targetResult = await this.targetFor(context, deployment, runtimeDir);
    if (targetResult.isErr()) {
      return targetResult.map(() => ({ deployment }));
    }
    const target = targetResult._unsafeUnwrap();
    const remoteRoot = this.remoteRuntimeDirectory(state.id.value);
    const env = deploymentEnv(deployment, state.runtimePlan.execution.port);
    const logs: DeploymentLogEntry[] = [
      phaseLog(
        "plan",
        `Using SSH docker-compose-stack execution on ${target.host}:${target.port}`,
      ),
    ];

    try {
      const prepared = await this.prepareSshSource(context, deployment, logs, {
        runtimeDir,
        remoteRoot,
        target,
        env,
      });

      if (!prepared.prepared) {
        return ok({ deployment: prepared.deployment });
      }

      const remoteWorkdir = prepared.source.remoteWorkdir;
      if (!remoteWorkdir) {
        return err(
          domainError.validation("Docker Compose SSH deployment requires a remote workdir"),
        );
      }

      const dockerVersion = this.runRemoteCommand({
        target,
        command: "docker version --format '{{.Server.Version}}'",
        cwd: runtimeDir,
        env,
      });

      if (dockerVersion.failed) {
        const message = "Docker is not available on the SSH target";
        logs.push(phaseLog("package", message, "error"));
        return ok({
          deployment: this.applyFailure(deployment, {
            logs,
            errorCode: "ssh_docker_unavailable",
            retryable: false,
            metadata: {
              host: target.host,
              ...prepared.source.metadata,
            },
          }),
        });
      }

      const runtimeInstanceNames = deriveRuntimeInstanceNames({
        deploymentId: state.id.value,
        metadata: state.runtimePlan.execution.metadata,
      });
      const composeFile = state.runtimePlan.execution.composeFile ?? "docker-compose.yml";
      const remoteComposeFile = composeFile.startsWith("/")
        ? composeFile
        : `${remoteWorkdir}/${composeFile}`;
      const deployOwnershipResult = await this.ensureExecutionStillOwned(context, deployment, {
        step: "before-compose-up",
      });
      if (deployOwnershipResult.isErr()) {
        return deployOwnershipResult.map(() => ({ deployment }));
      }
      const upCommand = renderRuntimeCommandString(
        RuntimeCommandBuilder.docker().composeUp({
          composeFile: remoteComposeFile,
          projectName: runtimeInstanceNames.composeProjectName,
          workingDirectory: remoteWorkdir,
        }),
        { quote: shellQuote },
      );
      logs.push(phaseLog("deploy", `Run docker compose on SSH target with ${remoteComposeFile}`));
      this.report(context, {
        deploymentId: state.id.value,
        phase: "deploy",
        status: "running",
        message: `Start compose stack ${remoteComposeFile}`,
      });

      const up = await this.runRemoteCommandStreaming({
        target,
        command: upCommand,
        cwd: runtimeDir,
        env,
        onOutput: this.createStreamingOutputSink(logs, {
          context,
          deploymentId: state.id.value,
          phase: "deploy",
        }),
      });

      if (up.failed) {
        const message = "SSH Docker Compose deployment failed";
        logs.push(phaseLog("deploy", message, "error"));
        return ok({
          deployment: this.applyFailure(deployment, {
            logs,
            errorCode: "ssh_docker_compose_failed",
            retryable: true,
            metadata: {
              host: target.host,
              remoteWorkdir,
              composeFile: remoteComposeFile,
              composeProjectName: runtimeInstanceNames.composeProjectName,
              ...prepared.source.metadata,
            },
          }),
        });
      }

      logs.push(phaseLog("verify", `SSH compose stack started from ${remoteComposeFile}`));
      deployment.applyExecutionResult(
        FinishedAt.rehydrate(new Date().toISOString()),
        ExecutionResult.rehydrate({
          exitCode: ExitCode.rehydrate(0),
          status: ExecutionStatusValue.rehydrate("succeeded"),
          retryable: false,
          logs,
          metadata: {
            host: target.host,
            remoteWorkdir,
            composeFile: remoteComposeFile,
            composeProjectName: runtimeInstanceNames.composeProjectName,
            ...prepared.source.metadata,
          },
        }),
      );

      return ok({ deployment });
    } catch (error) {
      if (context.entrypoint !== "cli") {
        this.logger.error("ssh_execution_backend.compose_execute_failed", {
          deploymentId: state.id.value,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return ok({
        deployment: this.applyFailure(deployment, {
          logs: [
            phaseLog(
              "deploy",
              error instanceof Error ? error.message : "Unknown SSH Docker Compose execution error",
              "error",
            ),
          ],
          errorCode: "ssh_docker_compose_execution_failed",
          retryable: true,
        }),
      });
    } finally {
      this.cleanupPrivateKey(target);
    }
  }

  async cancel(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ logs: DeploymentLogEntry[] }>> {
    const state = deployment.toState();
    const metadata = state.runtimePlan.execution.metadata ?? {};
    const runtimeDir = this.runtimeDirectory(state.id.value);
    mkdirSync(runtimeDir, { recursive: true });

    const targetResult = await this.targetFor(context, deployment, runtimeDir);
    if (targetResult.isErr()) {
      return targetResult.map(() => ({ logs: [] }));
    }

    const target = targetResult._unsafeUnwrap();
    const env = deploymentEnv(deployment);
    const runtimeInstanceNames = deriveRuntimeInstanceNames({
      deploymentId: state.id.value,
      metadata: state.runtimePlan.execution.metadata,
    });
    const containerName = metadata.containerName ?? runtimeInstanceNames.containerName;

    try {
      if (state.runtimePlan.execution.kind === "docker-container") {
        this.runRemoteCommand({
          target,
          command: `docker rm -f ${shellQuote(containerName)} >/dev/null 2>&1 || true`,
          cwd: runtimeDir,
          env,
        });
      }
    } finally {
      this.cleanupPrivateKey(target);
    }

    const logs = [
      phaseLog(
        "deploy",
        state.runtimePlan.execution.kind === "docker-container"
          ? `Removed SSH container ${containerName}`
          : "No SSH cancellation cleanup required",
      ),
    ];
    this.report(context, {
      deploymentId: state.id.value,
      phase: "deploy",
      status: "succeeded",
      message: "SSH deployment cancellation completed",
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
    const runtimeDir = this.runtimeDirectory(state.id.value);
    mkdirSync(runtimeDir, { recursive: true });

    const targetResult = await this.targetFor(context, deployment, runtimeDir);
    if (targetResult.isErr()) {
      return targetResult.map(() => ({ deployment }));
    }

    const target = targetResult._unsafeUnwrap();
    const logs: DeploymentLogEntry[] = [];
    const env = deploymentEnv(deployment);
    const runtimeInstanceNames = deriveRuntimeInstanceNames({
      deploymentId: state.id.value,
      metadata: state.runtimePlan.execution.metadata,
    });

    try {
      if (state.runtimePlan.execution.kind === "docker-container") {
        this.runRemoteCommand({
          target,
          command: `docker rm -f ${shellQuote(metadata.containerName ?? runtimeInstanceNames.containerName)}`,
          cwd: runtimeDir,
          env,
        });
      }
    } finally {
      this.cleanupPrivateKey(target);
    }

    logs.push(
      phaseLog(
        "rollback",
        metadata.containerName
          ? `Removed SSH container ${metadata.containerName}`
          : state.runtimePlan.execution.kind === "docker-container"
            ? `Removed SSH container ${runtimeInstanceNames.containerName}`
            : "No SSH container metadata recorded",
      ),
    );
    deployment.applyExecutionResult(
      FinishedAt.rehydrate(new Date().toISOString()),
      ExecutionResult.rehydrate({
        exitCode: ExitCode.rehydrate(0),
        status: ExecutionStatusValue.rehydrate("rolled-back"),
        retryable: false,
        logs,
      }),
    );
    this.report(context, {
      deploymentId: state.id.value,
      phase: "rollback",
      status: "succeeded",
      message: "SSH rollback completed",
    });

    return ok({ deployment });
  }
}
