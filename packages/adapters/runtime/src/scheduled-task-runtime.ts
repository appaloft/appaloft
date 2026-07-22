import {
  type DeploymentReadModel,
  type DeploymentSummary,
  type ExecutionContext,
  type ScheduledTaskRuntimeExecutionRequest,
  type ScheduledTaskRuntimeExecutionResult,
  type ScheduledTaskRuntimePort,
  type ServerRepository,
  toRepositoryContext,
} from "@appaloft/application";
import {
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  type DomainError,
  domainError,
  err,
  LatestRuntimeOwningDeploymentSpec,
  ok,
  redactScheduledTaskSecretText,
  ResourceId,
  type Result,
} from "@appaloft/core";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ash } from "@appaloft/ash";
import { runBufferedProcess, type BufferedProcessResult } from "./buffered-process";
import { deriveRuntimeInstanceNames } from "./runtime-instance-names";

export interface ScheduledTaskCommandRunnerInput {
  commandIntent: string;
  timeoutSeconds: number;
  environment: Record<string, string>;
}

export interface ScheduledTaskCommandRunnerResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}

export interface ScheduledTaskCommandRunner {
  run(input: ScheduledTaskCommandRunnerInput): Promise<ScheduledTaskCommandRunnerResult>;
}

export interface HermeticScheduledTaskRuntimeOptions {
  commandRunner?: ScheduledTaskCommandRunner;
  now?: () => string;
}

export interface ScheduledTaskProcessRunnerInput {
  command: readonly string[];
  timeoutMs: number;
  redactions: readonly string[];
  timeoutMessage: string;
}

export type ScheduledTaskProcessRunner = (
  input: ScheduledTaskProcessRunnerInput,
) => Promise<BufferedProcessResult>;

export interface RuntimeTargetScheduledTaskRuntimeOptions {
  deploymentReadModel: DeploymentReadModel;
  serverRepository: ServerRepository;
  processRunner?: ScheduledTaskProcessRunner;
  now?: () => string;
}

export interface DockerContainerScheduledTaskCommandInput {
  taskContainerName: string;
  sourceContainerName: string;
  image: string;
  commandIntent: string;
  environment: Record<string, string>;
  quote?: (value: string) => string;
}

export interface DockerComposeScheduledTaskCommandInput {
  composeFile: string;
  projectName: string;
  serviceName: string;
  commandIntent: string;
  environment: Record<string, string>;
  workdir?: string;
  quote?: (value: string) => string;
}

export interface DockerSwarmScheduledTaskCommandInput {
  taskServiceName: string;
  sourceServiceName: string;
  networkName: string;
  image: string;
  commandIntent: string;
  environment: Record<string, string>;
  timeoutSeconds: number;
  labels?: Record<string, string>;
  quote?: (value: string) => string;
}

class DefaultHermeticScheduledTaskCommandRunner implements ScheduledTaskCommandRunner {
  async run(input: ScheduledTaskCommandRunnerInput): Promise<ScheduledTaskCommandRunnerResult> {
    if (/\bfail\b/i.test(input.commandIntent)) {
      return {
        exitCode: 1,
        stderr: "scheduled task command failed",
      };
    }

    return {
      exitCode: 0,
      stdout: "scheduled task command completed",
    };
  }
}

function safeMessage(message: string, redactions: readonly string[]): string {
  return redactScheduledTaskSecretText(message, redactions);
}

function logEntries(input: {
  text: string | undefined;
  stream: "stdout" | "stderr";
  timestamp: string;
  redactions: readonly string[];
}): ScheduledTaskRuntimeExecutionResult["timeline"] {
  return (input.text ?? "")
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => ({
      timestamp: input.timestamp,
      stream: input.stream,
      message: safeMessage(line, input.redactions),
    }));
}

function failureSummary(stderr: string | undefined, exitCode: number): string {
  const firstLine = stderr
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine ?? `Scheduled task command exited with code ${exitCode}`;
}

function safeDockerName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");

  const fallback = normalized.length > 0 ? normalized : "scheduled-task";
  return fallback.length <= 63 ? fallback : fallback.slice(0, 63).replace(/[._-]+$/g, "");
}

function metadataValue(metadata: Record<string, string> | undefined, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = metadata?.[key]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function commandWithCwd(command: string, cwd?: string): string {
  return cwd ? `cd ${ash.quote(cwd)} && ${command}` : command;
}

function scheduledTaskRuntimeEnvironment(input: {
  request: ScheduledTaskRuntimeExecutionRequest;
  deployment?: DeploymentSummary;
}): Record<string, string> {
  const deployment = input.deployment;
  return {
    ...(input.request.environment ?? {}),
    APPALOFT_SCHEDULED_TASK_RUN_ID: input.request.runId,
    APPALOFT_SCHEDULED_TASK_ID: input.request.taskId,
    APPALOFT_RESOURCE_ID: input.request.resourceId,
    ...(deployment
      ? {
          APPALOFT_DEPLOYMENT_ID: deployment.id,
          APPALOFT_PROJECT_ID: deployment.projectId,
          APPALOFT_ENVIRONMENT_ID: deployment.environmentId,
          APPALOFT_DESTINATION_ID: deployment.destinationId,
          APPALOFT_SERVER_ID: deployment.serverId,
          APPALOFT_RUNTIME_PROVIDER: deployment.runtimePlan.target.providerKey,
          APPALOFT_RUNTIME_TARGET_KIND: deployment.runtimePlan.target.kind,
          APPALOFT_RUNTIME_EXECUTION_KIND: deployment.runtimePlan.execution.kind,
        }
      : {}),
  };
}

function assertEnvironmentNames(environment: Record<string, string>): Result<void, DomainError> {
  const invalidKey = Object.keys(environment).find(
    (key) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key),
  );

  if (invalidKey) {
    return err(
      domainError.validation("Scheduled task environment variable name is invalid", {
        phase: "scheduled-task-runtime-command-render",
        key: invalidKey,
      }),
    );
  }

  return ok(undefined);
}

export function renderDockerContainerScheduledTaskCommand(
  input: DockerContainerScheduledTaskCommandInput,
): Result<string, DomainError> {
  const environmentValidation = assertEnvironmentNames(input.environment);
  if (environmentValidation.isErr()) {
    return err(environmentValidation.error);
  }

  const quote = input.quote ?? ash.quote;
  const envFlags = Object.entries(input.environment).map(
    ([key, value]) => `--env ${quote(`${key}=${value}`)}`,
  );
  const dockerRunParts = [
    "docker",
    "run",
    "--rm",
    "--name",
    quote(input.taskContainerName),
    "--network",
    quote(`container:${input.sourceContainerName}`),
    ...envFlags,
    quote(input.image),
    "sh",
    "-lc",
    quote(input.commandIntent),
  ];

  return ok(
    [
      `docker rm -f ${quote(input.taskContainerName)} >/dev/null 2>&1 || true`,
      `docker inspect ${quote(input.sourceContainerName)} >/dev/null`,
      dockerRunParts.join(" "),
    ].join("; "),
  );
}

export function renderDockerComposeScheduledTaskCommand(
  input: DockerComposeScheduledTaskCommandInput,
): Result<string, DomainError> {
  const environmentValidation = assertEnvironmentNames(input.environment);
  if (environmentValidation.isErr()) {
    return err(environmentValidation.error);
  }

  const quote = input.quote ?? ash.quote;
  const envFlags = Object.entries(input.environment).flatMap(([key, value]) => [
    "--env",
    quote(`${key}=${value}`),
  ]);
  const dockerComposeParts = [
    "docker",
    "compose",
    "-p",
    quote(input.projectName),
    "-f",
    quote(input.composeFile),
    "run",
    "--rm",
    "--no-deps",
    ...envFlags,
    ...(input.workdir ? ["--workdir", quote(input.workdir)] : []),
    quote(input.serviceName),
    "sh",
    "-lc",
    quote(input.commandIntent),
  ];

  return ok(dockerComposeParts.join(" "));
}

export function renderDockerSwarmScheduledTaskCommand(
  input: DockerSwarmScheduledTaskCommandInput,
): Result<string, DomainError> {
  const environmentValidation = assertEnvironmentNames(input.environment);
  if (environmentValidation.isErr()) {
    return err(environmentValidation.error);
  }

  const quote = input.quote ?? ash.quote;
  const envFlags = Object.entries(input.environment).flatMap(([key, value]) => [
    "--env",
    quote(`${key}=${value}`),
  ]);
  const labelFlags = Object.entries(input.labels ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([key, value]) => ["--label", quote(`${key}=${value}`)]);
  const createParts = [
    "docker",
    "service",
    "create",
    "--name",
    quote(input.taskServiceName),
    "--restart-condition",
    "none",
    "--mode",
    "replicated-job",
    "--network",
    quote(input.networkName),
    ...labelFlags,
    ...envFlags,
    quote(input.image),
    "sh",
    "-lc",
    quote(input.commandIntent),
  ];
  const currentStateTemplate = quote("{{.CurrentState}}");

  return ok(
    [
      `docker service rm ${quote(input.taskServiceName)} >/dev/null 2>&1 || true`,
      `docker service inspect ${quote(input.sourceServiceName)} >/dev/null`,
      `${createParts.join(" ")} >/dev/null`,
      [
        "i=0",
        `while [ "$i" -lt ${input.timeoutSeconds} ]; do state=$(docker service ps --format ${currentStateTemplate} ${quote(input.taskServiceName)} | head -n 1)`,
        `case "$state" in Complete*) break ;; Failed*|Rejected*) docker service ps --no-trunc ${quote(input.taskServiceName)} >&2; docker service logs ${quote(input.taskServiceName)}; docker service rm ${quote(input.taskServiceName)} >/dev/null 2>&1 || true; exit 1 ;; esac`,
        'i=$((i + 1))',
        "sleep 1",
        "done",
      ].join("; "),
      `if [ "$i" -ge ${input.timeoutSeconds} ]; then docker service ps --no-trunc ${quote(input.taskServiceName)} >&2; docker service rm ${quote(input.taskServiceName)} >/dev/null 2>&1 || true; exit 124; fi`,
      `docker service logs ${quote(input.taskServiceName)}`,
      `docker service rm ${quote(input.taskServiceName)} >/dev/null 2>&1 || true`,
    ].join("; "),
  );
}

function writeSshIdentityFile(privateKey: string): { identityFile: string; cleanup(): void } {
  const directory = mkdtempSync(join(tmpdir(), "appaloft-scheduled-task-ssh-"));
  const identityFile = join(directory, "identity");
  writeFileSync(identityFile, privateKey.endsWith("\n") ? privateKey : `${privateKey}\n`, {
    mode: 0o600,
  });
  chmodSync(identityFile, 0o600);

  return {
    identityFile,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

function hostWithUsername(host: string, username?: string): string {
  return username && username.trim().length > 0 ? `${username}@${host}` : host;
}

interface SshScheduledTaskTarget {
  host: string;
  port: string;
  identityFile?: string;
  cleanup(): void;
}

function sshArgs(target: SshScheduledTaskTarget, remoteCommand: string): readonly string[] {
  return [
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-p",
    target.port,
    ...(target.identityFile ? ["-i", target.identityFile] : []),
    target.host,
    remoteCommand,
  ];
}

export class HermeticScheduledTaskRuntimePort implements ScheduledTaskRuntimePort {
  private readonly commandRunner: ScheduledTaskCommandRunner;
  private readonly now: () => string;

  constructor(options: HermeticScheduledTaskRuntimeOptions = {}) {
    this.commandRunner = options.commandRunner ?? new DefaultHermeticScheduledTaskCommandRunner();
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async execute(
    context: ExecutionContext,
    request: ScheduledTaskRuntimeExecutionRequest,
  ): Promise<Result<ScheduledTaskRuntimeExecutionResult, DomainError>> {
    void context;
    const startedAt = this.now();
    const environment = scheduledTaskRuntimeEnvironment({ request });
    const redactions = Object.values(request.environment ?? {});

    try {
      const runnerResult = await this.commandRunner.run({
        commandIntent: request.commandIntent,
        timeoutSeconds: request.timeoutSeconds,
        environment,
      });
      const finishedAt = this.now();
      const timeline = [
        ...logEntries({
          text: runnerResult.stdout,
          stream: "stdout",
          timestamp: finishedAt,
          redactions,
        }),
        ...logEntries({
          text: runnerResult.stderr,
          stream: "stderr",
          timestamp: finishedAt,
          redactions,
        }),
      ];

      return ok({
        status: runnerResult.exitCode === 0 ? "succeeded" : "failed",
        exitCode: runnerResult.exitCode,
        startedAt,
        finishedAt,
        timeline,
        ...(runnerResult.exitCode === 0
          ? {}
          : {
              failureSummary: safeMessage(
                failureSummary(runnerResult.stderr, runnerResult.exitCode),
                redactions,
              ),
            }),
      });
    } catch (error) {
      return err(
        domainError.infra("Scheduled task runtime execution failed", {
          phase: "scheduled-task-runtime-execution",
          runId: request.runId,
          taskId: request.taskId,
          resourceId: request.resourceId,
          error: error instanceof Error ? safeMessage(error.message, redactions) : "unknown",
        }),
      );
    }
  }
}

export class RuntimeTargetScheduledTaskRuntimePort implements ScheduledTaskRuntimePort {
  private readonly now: () => string;
  private readonly processRunner: ScheduledTaskProcessRunner;

  constructor(private readonly options: RuntimeTargetScheduledTaskRuntimeOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.processRunner =
      options.processRunner ??
      ((input) =>
        runBufferedProcess({
          command: input.command,
          timeoutMs: input.timeoutMs,
          redactions: input.redactions,
          timeoutMessage: input.timeoutMessage,
        }));
  }

  async execute(
    context: ExecutionContext,
    request: ScheduledTaskRuntimeExecutionRequest,
  ): Promise<Result<ScheduledTaskRuntimeExecutionResult, DomainError>> {
    const startedAt = this.now();
    const deployment = await this.options.deploymentReadModel.findOne(
      toRepositoryContext(context),
      LatestRuntimeOwningDeploymentSpec.forResource(ResourceId.rehydrate(request.resourceId)),
    );

    if (!deployment) {
      return err(
        domainError.conflict("Scheduled task resource does not have a runtime-owning deployment", {
          phase: "scheduled-task-runtime-resolution",
          resourceId: request.resourceId,
          runId: request.runId,
          taskId: request.taskId,
        }),
      );
    }

    const redactions = Object.values(request.environment ?? {});

    if (
      !(
        (deployment.runtimePlan.target.kind === "single-server" &&
          (deployment.runtimePlan.target.providerKey === "generic-ssh" ||
            deployment.runtimePlan.target.providerKey === "local-shell")) ||
        (deployment.runtimePlan.target.kind === "orchestrator-cluster" &&
          deployment.runtimePlan.target.providerKey === "docker-swarm")
      ) ||
      (deployment.runtimePlan.execution.kind !== "docker-container" &&
        deployment.runtimePlan.execution.kind !== "docker-compose-stack")
    ) {
      return err(
        domainError.runtimeTargetUnsupported(
          "Scheduled task runtime supports local-shell, generic SSH, and Docker Swarm Docker container or Compose targets",
          {
            phase: "scheduled-task-runtime-resolution",
            resourceId: request.resourceId,
            deploymentId: deployment.id,
            targetKind: deployment.runtimePlan.target.kind,
            providerKey: deployment.runtimePlan.target.providerKey,
            runtimeKind: deployment.runtimePlan.execution.kind,
          },
        ),
      );
    }

    const runtimeNames = deriveRuntimeInstanceNames({
      deploymentId: deployment.id,
      metadata: deployment.runtimePlan.execution.metadata,
    });
    const command =
      deployment.runtimePlan.target.providerKey === "docker-swarm"
        ? this.renderDockerSwarmCommand({ deployment, request })
        : deployment.runtimePlan.execution.kind === "docker-container"
        ? this.renderDockerContainerCommand({ deployment, request, runtimeNames })
        : this.renderDockerComposeCommand({ deployment, request, runtimeNames });

    if (command.isErr()) {
      return err(command.error);
    }

    let sshTargetToCleanup: Result<SshScheduledTaskTarget, DomainError> | undefined;
    const processCommand =
      deployment.runtimePlan.target.providerKey === "generic-ssh"
        ? await (async () => {
            const serverId = deployment.runtimePlan.target.serverIds[0] ?? deployment.serverId;
            if (!serverId) {
              return err(
                domainError.validation("Scheduled task runtime requires a server-backed target", {
                  deploymentId: deployment.id,
                  resourceId: deployment.resourceId,
                }),
              );
            }
            const target = await this.resolveSshTarget(context, serverId);
            if (target.isErr()) {
              return err(target.error);
            }

            sshTargetToCleanup = target;
            return ok(["ssh", ...sshArgs(target.value, command.value)] as readonly string[]);
          })()
        : ok(["sh", "-lc", command.value] as readonly string[]);

    if (processCommand.isErr()) {
      return err(processCommand.error);
    }

    try {
      const result = await this.processRunner({
        command: processCommand.value,
        timeoutMs: request.timeoutSeconds * 1000,
        redactions,
        timeoutMessage: "Scheduled task command timed out",
      });
      const finishedAt = this.now();
      const exitCode = result.exitCode ?? (result.timedOut ? 124 : 1);
      const timeline = [
        ...logEntries({
          text: result.stdout,
          stream: "stdout",
          timestamp: finishedAt,
          redactions,
        }),
        ...logEntries({
          text: result.stderr || result.reason,
          stream: "stderr",
          timestamp: finishedAt,
          redactions,
        }),
      ];

      return ok({
        status: exitCode === 0 && !result.error ? "succeeded" : "failed",
        exitCode,
        startedAt,
        finishedAt,
        timeline,
        ...(exitCode === 0 && !result.error
          ? {}
          : {
              failureSummary: safeMessage(
                failureSummary(result.stderr || result.reason, exitCode),
                redactions,
              ),
        }),
      });
    } finally {
      if (sshTargetToCleanup?.isOk()) {
        sshTargetToCleanup.value.cleanup();
      }
    }
  }

  private renderDockerContainerCommand(input: {
    deployment: DeploymentSummary;
    request: ScheduledTaskRuntimeExecutionRequest;
    runtimeNames: ReturnType<typeof deriveRuntimeInstanceNames>;
  }): Result<string, DomainError> {
    const image =
      input.deployment.runtimePlan.execution.image ?? input.deployment.runtimePlan.runtimeArtifact?.image;
    if (!image) {
      return err(
        domainError.runtimeTargetUnsupported("Scheduled task runtime requires a Docker image", {
          phase: "scheduled-task-runtime-resolution",
          resourceId: input.request.resourceId,
          deploymentId: input.deployment.id,
          runtimeKind: input.deployment.runtimePlan.execution.kind,
        }),
      );
    }

    const sourceContainerName =
      input.deployment.runtimePlan.execution.metadata?.containerName ?? input.runtimeNames.containerName;
    return renderDockerContainerScheduledTaskCommand({
      taskContainerName: safeDockerName(`appaloft-task-${input.request.runId}`),
      sourceContainerName,
      image,
      commandIntent: input.request.commandIntent,
      environment: scheduledTaskRuntimeEnvironment({
        request: input.request,
        deployment: input.deployment,
      }),
    });
  }

  private renderDockerComposeCommand(input: {
    deployment: DeploymentSummary;
    request: ScheduledTaskRuntimeExecutionRequest;
    runtimeNames: ReturnType<typeof deriveRuntimeInstanceNames>;
  }): Result<string, DomainError> {
    const metadata = input.deployment.runtimePlan.execution.metadata;
    const composeFile =
      metadataValue(metadata, ["composeFile", "compose.file"]) ??
      input.deployment.runtimePlan.execution.composeFile ??
      input.deployment.runtimePlan.runtimeArtifact?.composeFile;
    const serviceName = metadataValue(metadata, [
      "composeServiceName",
      "composeService",
      "composeTargetService",
      "targetServiceName",
      "resource.targetServiceName",
      "network.targetServiceName",
    ]);

    if (!composeFile || !serviceName) {
      return err(
        domainError.runtimeTargetUnsupported(
          "Scheduled task Compose runtime requires compose file and target service metadata",
          {
            phase: "scheduled-task-runtime-resolution",
            resourceId: input.request.resourceId,
            deploymentId: input.deployment.id,
            runtimeKind: input.deployment.runtimePlan.execution.kind,
            missing: !composeFile ? "composeFile" : "targetServiceName",
          },
        ),
      );
    }

    const workdir = metadataValue(metadata, ["taskWorkdir", "containerWorkdir", "dockerWorkdir"]);
    const command = renderDockerComposeScheduledTaskCommand({
      composeFile,
      projectName:
        metadataValue(metadata, ["composeProjectName", "compose.projectName"]) ??
        input.runtimeNames.composeProjectName,
      serviceName,
      commandIntent: input.request.commandIntent,
      environment: scheduledTaskRuntimeEnvironment({
        request: input.request,
        deployment: input.deployment,
      }),
      ...(workdir ? { workdir } : {}),
    });

    return command.map((value) =>
      commandWithCwd(
        value,
        metadataValue(metadata, ["remoteWorkdir", "workdir", "compose.workingDirectory"]) ??
          input.deployment.runtimePlan.execution.workingDirectory,
      ),
    );
  }

  private renderDockerSwarmCommand(input: {
    deployment: DeploymentSummary;
    request: ScheduledTaskRuntimeExecutionRequest;
  }): Result<string, DomainError> {
    const metadata = input.deployment.runtimePlan.execution.metadata;
    const image =
      input.deployment.runtimePlan.execution.image ?? input.deployment.runtimePlan.runtimeArtifact?.image;
    const sourceServiceName = metadataValue(metadata, [
      "swarm.serviceName",
      "swarmServiceName",
      "serviceName",
    ]);

    if (!image || !sourceServiceName) {
      return err(
        domainError.runtimeTargetUnsupported(
          "Scheduled task Docker Swarm runtime requires image and swarm service metadata",
          {
            phase: "scheduled-task-runtime-resolution",
            resourceId: input.request.resourceId,
            deploymentId: input.deployment.id,
            runtimeKind: input.deployment.runtimePlan.execution.kind,
            missing: !image ? "image" : "swarm.serviceName",
          },
        ),
      );
    }

    return renderDockerSwarmScheduledTaskCommand({
      taskServiceName: safeDockerName(`appaloft-task-${input.request.runId}`),
      sourceServiceName,
      networkName:
        metadataValue(metadata, [
          "swarm.networkName",
          "swarm.edgeNetworkName",
          "edgeNetworkName",
          "networkName",
        ]) ?? "appaloft-edge",
      image,
      commandIntent: input.request.commandIntent,
      environment: scheduledTaskRuntimeEnvironment({
        request: input.request,
        deployment: input.deployment,
      }),
      timeoutSeconds: input.request.timeoutSeconds,
      labels: {
        "appaloft.managed": "true",
        "appaloft.runtime-target": "docker-swarm",
        "appaloft.scheduled-task": "true",
        "appaloft.scheduled-task-run-id": input.request.runId,
        "appaloft.scheduled-task-id": input.request.taskId,
        "appaloft.resource-id": input.request.resourceId,
        "appaloft.deployment-id": input.deployment.id,
      },
    });
  }

  private async resolveSshTarget(
    context: ExecutionContext,
    serverId: string,
  ): Promise<Result<SshScheduledTaskTarget, DomainError>> {
    const server = await this.options.serverRepository.findOne(
      toRepositoryContext(context),
      DeploymentTargetByIdSpec.create(DeploymentTargetId.rehydrate(serverId)),
    );
    const serverState = server?.toState();

    if (!serverState) {
      return err(domainError.notFound("server", serverId));
    }

    const username = serverState.credential?.username?.value;
    const privateKey = serverState.credential?.privateKey?.value;

    if (serverState.credential?.kind.value === "ssh-private-key" && privateKey) {
      const identity = writeSshIdentityFile(privateKey);
      return ok({
        host: hostWithUsername(serverState.host.value, username),
        port: String(serverState.port.value),
        identityFile: identity.identityFile,
        cleanup: identity.cleanup,
      });
    }

    return ok({
      host: hostWithUsername(serverState.host.value, username),
      port: String(serverState.port.value),
      cleanup: () => undefined,
    });
  }
}
