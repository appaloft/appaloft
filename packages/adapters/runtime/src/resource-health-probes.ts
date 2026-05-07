import {
  type ExecutionContext,
  type ResourceHealthProbeRequest,
  type ResourceHealthProbeResult,
  type ResourceHealthProbeRunner,
  type ResourceRuntimeHealthProbeRequest,
  type ResourceRuntimeHealthProbeResult,
  type ServerRepository,
  toRepositoryContext,
} from "@appaloft/application";
import {
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  domainError,
  err,
  ok,
  type DomainError,
  type Result,
} from "@appaloft/core";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const responsePreviewLimit = 4096;
const dockerSwarmHealthProbeTimeoutExitCode = 124;

export interface RuntimeHealthCommandRunnerInput {
  args: string[];
  timeoutMs: number;
}

export interface RuntimeHealthCommandRunnerResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}

export type RuntimeHealthCommandRunner = (
  input: RuntimeHealthCommandRunnerInput,
) => Promise<Result<RuntimeHealthCommandRunnerResult, DomainError>>;

interface DockerSwarmServiceTask {
  currentState: string;
  desiredState: string;
  error?: string;
}

interface SshRuntimeHealthTarget {
  cleanup: () => Promise<void>;
  host: string;
  identityFile?: string;
  port: string;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function hostWithUsername(host: string, username?: string): string {
  return username && !host.includes("@") ? `${username}@${host}` : host;
}

async function writeSshIdentityFile(privateKey: string): Promise<{
  cleanup(): Promise<void>;
  identityFile: string;
}> {
  const sshDir = await mkdtemp(join(tmpdir(), "appaloft-runtime-health-ssh-"));
  const identityFile = join(sshDir, "id_runtime_health");
  await writeFile(identityFile, privateKey.endsWith("\n") ? privateKey : `${privateKey}\n`, {
    mode: 0o600,
  });
  await chmod(identityFile, 0o600);

  return {
    cleanup: () => rm(sshDir, { recursive: true, force: true }),
    identityFile,
  };
}

function sshArgs(target: SshRuntimeHealthTarget): string[] {
  return [
    "-p",
    target.port,
    ...(target.identityFile
      ? ["-i", target.identityFile, "-o", "IdentitiesOnly=yes"]
      : []),
    "-o",
    "BatchMode=yes",
    "-o",
    "PreferredAuthentications=publickey",
    "-o",
    "PasswordAuthentication=no",
    "-o",
    "KbdInteractiveAuthentication=no",
    "-o",
    "NumberOfPasswordPrompts=0",
    "-o",
    "StrictHostKeyChecking=accept-new",
    target.host,
  ];
}

function dockerSwarmServicePsCommand(service: string): string {
  return [
    "docker",
    "service",
    "ps",
    "--no-trunc",
    "--format",
    shellQuote("{{json .}}"),
    shellQuote(service),
  ].join(" ");
}

function normalizedProbeUrl(raw: string): Result<URL, DomainError> {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return err(
        domainError.resourceHealthUnavailable("Resource health probe URL is unsupported", {
          phase: "health-check-execution",
          protocol: url.protocol,
        }),
      );
    }
    return ok(url);
  } catch {
    return err(
      domainError.resourceHealthUnavailable("Resource health probe URL is invalid", {
        phase: "health-check-execution",
      }),
    );
  }
}

async function readBoundedText(response: Response): Promise<string> {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (total < responsePreviewLimit) {
    const read = await reader.read();
    if (read.done) {
      break;
    }

    const remaining = responsePreviewLimit - total;
    const chunk = read.value.byteLength > remaining ? read.value.slice(0, remaining) : read.value;
    chunks.push(chunk);
    total += chunk.byteLength;

    if (read.value.byteLength > remaining) {
      await reader.cancel();
      break;
    }
  }

  return new TextDecoder().decode(Uint8Array.from(chunks.flatMap((chunk) => [...chunk])));
}

function failedProbe(input: {
  request: ResourceHealthProbeRequest;
  observedAt: string;
  durationMs: number;
  statusCode?: number;
  reasonCode: string;
  message: string;
  retriable?: boolean;
}): ResourceHealthProbeResult {
  return {
    name: input.request.name,
    target: input.request.target,
    status: "failed",
    observedAt: input.observedAt,
    durationMs: input.durationMs,
    ...(input.statusCode ? { statusCode: input.statusCode } : {}),
    reasonCode: input.reasonCode,
    message: input.message,
    retriable: input.retriable ?? true,
  };
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function parseDockerSwarmServiceTasks(stdout: string): Result<DockerSwarmServiceTask[], DomainError> {
  const tasks: DockerSwarmServiceTask[] = [];

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return err(
        domainError.resourceHealthUnavailable("Docker Swarm service health output is invalid", {
          phase: "runtime-live-probe",
        }),
      );
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return err(
        domainError.resourceHealthUnavailable("Docker Swarm service health output is invalid", {
          phase: "runtime-live-probe",
        }),
      );
    }

    const record = parsed as Record<string, unknown>;
    const currentState = stringField(record, "CurrentState");
    const desiredState = stringField(record, "DesiredState");
    if (!currentState || !desiredState) {
      return err(
        domainError.resourceHealthUnavailable("Docker Swarm service health output is incomplete", {
          phase: "runtime-live-probe",
        }),
      );
    }

    const taskError = stringField(record, "Error");
    tasks.push({
      currentState,
      desiredState,
      ...(taskError ? { error: taskError } : {}),
    });
  }

  return ok(tasks);
}

function normalizedState(value: string): string {
  return value.trim().toLowerCase();
}

function isRunningTask(task: DockerSwarmServiceTask): boolean {
  return (
    normalizedState(task.desiredState) === "running" &&
    normalizedState(task.currentState).startsWith("running")
  );
}

function isStartingTask(task: DockerSwarmServiceTask): boolean {
  const currentState = normalizedState(task.currentState);
  return (
    normalizedState(task.desiredState) === "running" &&
    (currentState.startsWith("new") ||
      currentState.startsWith("pending") ||
      currentState.startsWith("assigned") ||
      currentState.startsWith("accepted") ||
      currentState.startsWith("preparing") ||
      currentState.startsWith("starting"))
  );
}

function isFailedTask(task: DockerSwarmServiceTask): boolean {
  const currentState = normalizedState(task.currentState);
  return (
    normalizedState(task.desiredState) === "running" &&
    (currentState.startsWith("failed") ||
      currentState.startsWith("rejected") ||
      currentState.startsWith("orphaned") ||
      Boolean(task.error))
  );
}

function serviceName(request: ResourceRuntimeHealthProbeRequest): Result<string, DomainError> {
  const name = request.runtimeMetadata?.["swarm.serviceName"];
  if (name && name.trim().length > 0) {
    return ok(name);
  }

  return err(
    domainError.resourceHealthUnavailable("Docker Swarm service name is not available", {
      phase: "runtime-live-probe",
      step: "docker-swarm-service-name",
      resourceId: request.resourceId,
      deploymentId: request.deploymentId,
    }),
  );
}

function failedRuntimeProbe(input: {
  request: ResourceRuntimeHealthProbeRequest;
  serviceName?: string;
  observedAt: string;
  durationMs: number;
  exitCode?: number;
  reasonCode: string;
  message: string;
  retriable?: boolean;
}): ResourceRuntimeHealthProbeResult {
  return {
    lifecycle: "unknown",
    health: "unknown",
    observedAt: input.observedAt,
    reasonCode: input.reasonCode,
    message: input.message,
    check: {
      name: "runtime-service",
      target: "container",
      status: "failed",
      observedAt: input.observedAt,
      durationMs: input.durationMs,
      ...(input.exitCode ? { exitCode: input.exitCode } : {}),
      reasonCode: input.reasonCode,
      phase: "runtime-live-probe",
      message: input.message,
      retriable: input.retriable ?? true,
      metadata: {
        providerKey: input.request.providerKey,
        runtimeKind: input.request.runtimeKind,
        ...(input.serviceName ? { serviceName: input.serviceName } : {}),
      },
    },
  };
}

function dockerSwarmRuntimeProbeResult(input: {
  request: ResourceRuntimeHealthProbeRequest;
  serviceName: string;
  observedAt: string;
  durationMs: number;
  tasks: DockerSwarmServiceTask[];
}): ResourceRuntimeHealthProbeResult {
  const activeTasks = input.tasks.filter((task) => normalizedState(task.desiredState) === "running");
  const observedTasks = activeTasks.length > 0 ? activeTasks : input.tasks;
  const runningTasks = observedTasks.filter(isRunningTask).length;
  const failedTasks = observedTasks.filter(isFailedTask).length;
  const startingTasks = observedTasks.filter(isStartingTask).length;
  const taskCount = observedTasks.length;

  if (taskCount === 0) {
    return failedRuntimeProbe({
      request: input.request,
      serviceName: input.serviceName,
      observedAt: input.observedAt,
      durationMs: input.durationMs,
      reasonCode: "docker_swarm_service_not_found",
      message: "Docker Swarm service has no observable tasks.",
    });
  }

  const lifecycle =
    failedTasks > 0 ? "degraded" : runningTasks === taskCount ? "running" : "starting";
  const health =
    failedTasks > 0 ? "unhealthy" : runningTasks === taskCount ? "healthy" : "unknown";
  const status = failedTasks > 0 ? "failed" : runningTasks === taskCount ? "passed" : "unknown";
  const reasonCode =
    failedTasks > 0
      ? "docker_swarm_service_task_failed"
      : runningTasks === taskCount
        ? "docker_swarm_service_running"
        : "docker_swarm_service_starting";

  return {
    lifecycle,
    health,
    observedAt: input.observedAt,
    reasonCode,
    ...(startingTasks > 0 && failedTasks === 0
      ? { message: "Docker Swarm service tasks are still starting." }
      : {}),
    check: {
      name: "runtime-service",
      target: "container",
      status,
      observedAt: input.observedAt,
      durationMs: input.durationMs,
      reasonCode,
      phase: "runtime-live-probe",
      retriable: status !== "passed",
      metadata: {
        providerKey: input.request.providerKey,
        runtimeKind: input.request.runtimeKind,
        serviceName: input.serviceName,
        taskCount: String(taskCount),
        runningTasks: String(runningTasks),
        failedTasks: String(failedTasks),
      },
    },
  };
}

async function defaultRuntimeHealthCommandRunner(
  input: RuntimeHealthCommandRunnerInput,
): Promise<Result<RuntimeHealthCommandRunnerResult, DomainError>> {
  try {
    const process = Bun.spawn(input.args, {
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdoutPromise = new Response(process.stdout).text();
    const stderrPromise = new Response(process.stderr).text();
    let timeout: Timer | undefined;
    const timedOut = new Promise<"timeout">((resolve) => {
      timeout = setTimeout(() => resolve("timeout"), input.timeoutMs);
    });
    const outcome = await Promise.race([process.exited, timedOut]);
    if (timeout) {
      clearTimeout(timeout);
    }

    if (outcome === "timeout") {
      process.kill();
      const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
      return ok({
        exitCode: dockerSwarmHealthProbeTimeoutExitCode,
        stdout,
        stderr: stderr || "Docker Swarm service health probe timed out.",
      });
    }

    const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
    return ok({
      exitCode: outcome,
      stdout,
      stderr,
    });
  } catch (error) {
    return err(
      domainError.resourceHealthUnavailable(
        error instanceof Error ? error.message : "Docker Swarm service health probe failed",
        {
          phase: "runtime-live-probe",
        },
      ),
    );
  }
}

export class RuntimeResourceHealthProbeRunner implements ResourceHealthProbeRunner {
  constructor(
    private readonly runRuntimeHealthCommand: RuntimeHealthCommandRunner =
      defaultRuntimeHealthCommandRunner,
    private readonly serverRepository?: ServerRepository,
  ) {}

  async probe(
    context: ExecutionContext,
    request: ResourceHealthProbeRequest,
  ): Promise<Result<ResourceHealthProbeResult, DomainError>> {
    const urlResult = normalizedProbeUrl(request.url);
    if (urlResult.isErr()) {
      return err(urlResult.error);
    }

    const startedAt = Date.now();
    const timeoutMs = Math.max(1, request.timeoutSeconds) * 1000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(urlResult.value, {
        method: request.method,
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "appaloft-resource-health/1",
          "X-Appaloft-Request-Id": context.requestId,
        },
      });
      const durationMs = Date.now() - startedAt;

      if (response.status !== request.expectedStatusCode) {
        return ok(
          failedProbe({
            request,
            observedAt: new Date().toISOString(),
            durationMs,
            statusCode: response.status,
            reasonCode: "resource_health_check_response_mismatch",
            message: "Resource health probe returned an unexpected status code.",
          }),
        );
      }

      if (request.expectedResponseText && request.method !== "HEAD") {
        const bodyPreview = await readBoundedText(response);
        if (!bodyPreview.includes(request.expectedResponseText)) {
          return ok(
            failedProbe({
              request,
              observedAt: new Date().toISOString(),
              durationMs,
              statusCode: response.status,
              reasonCode: "resource_health_check_response_mismatch",
              message: "Resource health probe response did not contain the expected text.",
            }),
          );
        }
      }

      return ok({
        name: request.name,
        target: request.target,
        status: "passed",
        observedAt: new Date().toISOString(),
        durationMs,
        statusCode: response.status,
        metadata: {
          probeRunner: "runtime-resource-health-probe",
        },
      });
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const timedOut = error instanceof Error && error.name === "AbortError";
      return ok(
        failedProbe({
          request,
          observedAt: new Date().toISOString(),
          durationMs,
          reasonCode: timedOut ? "resource_health_check_timeout" : "resource_health_check_failed",
          message: timedOut
            ? "Resource health probe timed out."
            : "Resource health probe could not reach the target.",
          retriable: true,
        }),
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async probeRuntime(
    context: ExecutionContext,
    request: ResourceRuntimeHealthProbeRequest,
  ): Promise<Result<ResourceRuntimeHealthProbeResult, DomainError>> {
    if (request.providerKey !== "docker-swarm") {
      return err(
        domainError.resourceHealthUnavailable("Runtime health probe target is unsupported", {
          phase: "runtime-live-probe",
          providerKey: request.providerKey,
        }),
      );
    }

    const serviceNameResult = serviceName(request);
    if (serviceNameResult.isErr()) {
      return err(serviceNameResult.error);
    }

    const startedAt = Date.now();
    const service = serviceNameResult.value;
    const sshTargetResult = await this.resolveSshTarget(context, request);
    if (sshTargetResult.isErr()) {
      return err(sshTargetResult.error);
    }

    const sshTarget = sshTargetResult.value;
    let commandResult: Result<RuntimeHealthCommandRunnerResult, DomainError>;
    try {
      commandResult = await this.runRuntimeHealthCommand({
        args: sshTarget
          ? ["ssh", ...sshArgs(sshTarget), dockerSwarmServicePsCommand(service)]
          : ["docker", "service", "ps", "--no-trunc", "--format", "{{json .}}", service],
        timeoutMs: Math.max(1, request.timeoutSeconds) * 1000,
      });
    } finally {
      await sshTarget?.cleanup();
    }
    const observedAt = new Date().toISOString();
    const durationMs = Date.now() - startedAt;

    if (commandResult.isErr()) {
      return err(commandResult.error);
    }

    if (commandResult.value.exitCode !== 0) {
      return ok(
        failedRuntimeProbe({
          request,
          serviceName: service,
          observedAt,
          durationMs,
          exitCode: commandResult.value.exitCode,
          reasonCode:
            commandResult.value.exitCode === dockerSwarmHealthProbeTimeoutExitCode
              ? "docker_swarm_service_probe_timeout"
              : "docker_swarm_service_probe_failed",
          message:
            commandResult.value.stderr?.trim() ||
            "Docker Swarm service health probe could not inspect the service.",
        }),
      );
    }

    const tasksResult = parseDockerSwarmServiceTasks(commandResult.value.stdout ?? "");
    if (tasksResult.isErr()) {
      return err(tasksResult.error);
    }

    return ok(
      dockerSwarmRuntimeProbeResult({
        request,
        serviceName: service,
        observedAt,
        durationMs,
        tasks: tasksResult.value,
      }),
    );
  }

  private async resolveSshTarget(
    context: ExecutionContext,
    request: ResourceRuntimeHealthProbeRequest,
  ): Promise<Result<SshRuntimeHealthTarget | null, DomainError>> {
    if (!request.targetServerId || !this.serverRepository) {
      return ok(null);
    }

    const server = await this.serverRepository.findOne(
      toRepositoryContext(context),
      DeploymentTargetByIdSpec.create(DeploymentTargetId.rehydrate(request.targetServerId)),
    );
    const serverState = server?.toState();
    if (!serverState) {
      return ok(null);
    }

    const username = serverState.credential?.username?.value;
    const host = username
      ? hostWithUsername(serverState.host.value, username)
      : serverState.host.value;
    let cleanup = async () => {};
    let identityFile: string | undefined;
    const privateKey = serverState.credential?.privateKey?.value;
    if (serverState.credential?.kind.value === "ssh-private-key" && privateKey) {
      const identity = await writeSshIdentityFile(privateKey);
      identityFile = identity.identityFile;
      cleanup = identity.cleanup;
    }

    return ok({
      cleanup,
      host,
      ...(identityFile ? { identityFile } : {}),
      port: String(serverState.port.value),
    });
  }
}
