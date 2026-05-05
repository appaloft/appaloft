import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ExecutionContext,
  type ResourceRuntimeControlOperation,
  type ResourceRuntimeControlPhaseSummary,
  type ResourceRuntimeControlRuntimeState,
  type ResourceRuntimeControlTargetPort,
  type ResourceRuntimeControlTargetRequest,
  type ResourceRuntimeControlTargetResult,
  type RepositoryContext,
  type ServerRepository,
} from "@appaloft/application";
import {
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  type DeploymentTargetState,
  type DomainError,
  domainError,
  err,
  ok,
  type Result,
} from "@appaloft/core";

import { deriveRuntimeInstanceNames } from "./runtime-instance-names";

export interface RuntimeControlCommandExecution {
  command: string;
  workingDirectory?: string;
  operation: ResourceRuntimeControlOperation;
  providerKey: string;
  serverId: string;
}

export interface RuntimeControlCommandExecutor {
  run(
    context: ExecutionContext,
    execution: RuntimeControlCommandExecution,
  ): Promise<Result<void, DomainError>>;
}

export interface RuntimeControlSpawnOptions {
  cwd?: string;
  encoding: "utf8";
  timeout: number;
}

export interface RuntimeControlSpawnResult {
  status: number | null;
  stdout?: string;
  stderr?: string;
  error?: Error;
}

export type RuntimeControlSpawn = (
  args: readonly string[],
  options: RuntimeControlSpawnOptions,
) => RuntimeControlSpawnResult;

type SshRuntimeControlTarget = {
  host: string;
  port: string;
  identityFile?: string;
  cleanup(): void;
};

export interface RuntimeControlCommandPlan {
  command: string;
  workingDirectory?: string;
  runtimeState: ResourceRuntimeControlRuntimeState;
  phases?: ResourceRuntimeControlPhaseSummary[];
}

export type RuntimeControlCommandResolution =
  | {
      kind: "planned";
      plan: RuntimeControlCommandPlan;
    }
  | {
      kind: "blocked";
      result: ResourceRuntimeControlTargetResult;
    };

function shellQuote(input: string): string {
  return `'${input.replaceAll("'", "'\\''")}'`;
}

function repositoryContext(context: ExecutionContext): RepositoryContext {
  return {
    locale: context.locale,
    requestId: context.requestId,
    t: context.t,
    tracer: context.tracer,
    ...(context.actor ? { actor: context.actor } : {}),
  };
}

function defaultSpawn(args: readonly string[], options: RuntimeControlSpawnOptions) {
  const [command, ...commandArgs] = args;
  if (!command) {
    return {
      status: null,
      error: new Error("Runtime control command is empty"),
    };
  }

  return spawnSync(command, commandArgs, options);
}

function hostWithUsername(host: string, username?: string): string {
  return username && !host.includes("@") ? `${username}@${host}` : host;
}

function remoteCommandWithCwd(command: string, cwd?: string): string {
  return cwd ? `cd ${shellQuote(cwd)} && ${command}` : command;
}

function writeSshIdentityFile(privateKey: string): {
  identityFile: string;
  cleanup(): void;
} {
  const sshDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-control-ssh-"));
  const identityFile = join(sshDir, "id_runtime_control");
  writeFileSync(identityFile, privateKey.endsWith("\n") ? privateKey : `${privateKey}\n`, {
    mode: 0o600,
  });
  chmodSync(identityFile, 0o600);

  return {
    identityFile,
    cleanup: () => rmSync(sshDir, { recursive: true, force: true }),
  };
}

function sshArgs(target: SshRuntimeControlTarget, remoteCommand: string): string[] {
  return [
    "-p",
    target.port,
    ...(target.identityFile ? ["-i", target.identityFile, "-o", "IdentitiesOnly=yes"] : []),
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
    remoteCommand,
  ];
}

function runtimeStateForOperation(
  operation: ResourceRuntimeControlOperation,
): ResourceRuntimeControlRuntimeState {
  switch (operation) {
    case "stop":
      return "stopped";
    case "start":
    case "restart":
      return "running";
  }
}

function phasesForOperation(
  operation: ResourceRuntimeControlOperation,
): ResourceRuntimeControlPhaseSummary[] | undefined {
  return operation === "restart"
    ? [
        {
          phase: "stop",
          status: "succeeded",
        },
        {
          phase: "start",
          status: "succeeded",
        },
      ]
    : undefined;
}

function commandVerb(operation: ResourceRuntimeControlOperation): string {
  return operation;
}

function blocked(input: {
  blockedReason: NonNullable<ResourceRuntimeControlTargetResult["blockedReason"]>;
  errorCode: string;
}): ResourceRuntimeControlTargetResult {
  return {
    status: "blocked",
    runtimeState: "unknown",
    blockedReason: input.blockedReason,
    errorCode: input.errorCode,
  };
}

export function dockerContainerRuntimeControlCommand(input: {
  operation: ResourceRuntimeControlOperation;
  containerName: string;
  quote?: (value: string) => string;
}): string {
  const quote = input.quote ?? shellQuote;
  return `docker ${commandVerb(input.operation)} ${quote(input.containerName)}`;
}

export function dockerComposeRuntimeControlCommand(input: {
  operation: ResourceRuntimeControlOperation;
  composeFile: string;
  projectName: string;
  serviceName?: string;
  quote?: (value: string) => string;
}): string {
  const quote = input.quote ?? shellQuote;
  return [
    "docker compose",
    "-p",
    quote(input.projectName),
    "-f",
    quote(input.composeFile),
    commandVerb(input.operation),
    input.serviceName ? quote(input.serviceName) : "",
  ]
    .filter((part) => part.length > 0)
    .join(" ");
}

export function planResourceRuntimeControlCommand(
  request: ResourceRuntimeControlTargetRequest,
  input?: {
    quote?: (value: string) => string;
  },
): RuntimeControlCommandResolution {
  const quote = input?.quote ?? shellQuote;
  const runtimeNames = deriveRuntimeInstanceNames({
    deploymentId: request.deploymentId,
    metadata: request.runtimeMetadata,
  });
  const runtimeState = runtimeStateForOperation(request.operation);
  const phases = phasesForOperation(request.operation);

  if (request.runtimeKind === "docker-container") {
    const containerName = request.runtimeMetadata?.containerName ?? runtimeNames.containerName;
    return {
      kind: "planned",
      plan: {
        command: dockerContainerRuntimeControlCommand({
          operation: request.operation,
          containerName,
          quote,
        }),
        ...(request.workingDirectory ? { workingDirectory: request.workingDirectory } : {}),
        runtimeState,
        ...(phases ? { phases } : {}),
      },
    };
  }

  if (request.runtimeKind === "docker-compose-stack") {
    const composeFile = request.runtimeMetadata?.composeFile ?? request.composeFile;
    if (!composeFile) {
      return {
        kind: "blocked",
        result: blocked({
          blockedReason: "runtime-metadata-stale",
          errorCode: "resource_runtime_metadata_missing",
        }),
      };
    }

    return {
      kind: "planned",
      plan: {
        command: dockerComposeRuntimeControlCommand({
          operation: request.operation,
          composeFile,
          projectName: request.runtimeMetadata?.composeProjectName ?? runtimeNames.composeProjectName,
          ...(request.targetServiceName ? { serviceName: request.targetServiceName } : {}),
          quote,
        }),
        ...(request.workingDirectory ? { workingDirectory: request.workingDirectory } : {}),
        runtimeState,
        ...(phases ? { phases } : {}),
      },
    };
  }

  return {
    kind: "blocked",
    result: blocked({
      blockedReason: "adapter-unsupported",
      errorCode: "resource_runtime_control_unsupported",
    }),
  };
}

function executionFailure(error: DomainError): DomainError {
  const safeAdapterErrorCode = error.details?.safeAdapterErrorCode;

  return domainError.provider(
    "Runtime control command execution failed",
    {
      phase: "runtime-control-execution",
      safeAdapterErrorCode:
        typeof safeAdapterErrorCode === "string" ? safeAdapterErrorCode : error.code,
    },
    true,
  );
}

function commandFailure(input: {
  execution: RuntimeControlCommandExecution;
  result: RuntimeControlSpawnResult;
}): DomainError {
  return domainError.provider(
    "Runtime control command failed",
    {
      phase: "runtime-control-execution",
      providerKey: input.execution.providerKey,
      operation: input.execution.operation,
      safeAdapterErrorCode: input.result.error
        ? "runtime_control_spawn_failed"
        : "runtime_control_command_failed",
      ...(typeof input.result.status === "number" ? { exitCode: input.result.status } : {}),
    },
    true,
  );
}

export class RuntimeControlShellCommandExecutor implements RuntimeControlCommandExecutor {
  constructor(
    private readonly input: {
      serverRepository?: ServerRepository;
      spawn?: RuntimeControlSpawn;
      timeoutMs?: number;
    } = {},
  ) {}

  async run(
    context: ExecutionContext,
    execution: RuntimeControlCommandExecution,
  ): Promise<Result<void, DomainError>> {
    switch (execution.providerKey) {
      case "local-shell":
        return this.runLocal(execution);
      case "generic-ssh":
        return this.runSsh(context, execution);
      default:
        return err(
          domainError.provider(
            "Runtime control is not supported for provider",
            {
              phase: "runtime-control-execution",
              providerKey: execution.providerKey,
              operation: execution.operation,
              safeAdapterErrorCode: "resource_runtime_control_unsupported",
            },
            false,
          ),
        );
    }
  }

  private runLocal(execution: RuntimeControlCommandExecution): Result<void, DomainError> {
    const result = this.spawn(["sh", "-lc", execution.command], {
      ...(execution.workingDirectory ? { cwd: execution.workingDirectory } : {}),
      encoding: "utf8",
      timeout: this.timeoutMs,
    });

    return this.toResult(execution, result);
  }

  private async runSsh(
    context: ExecutionContext,
    execution: RuntimeControlCommandExecution,
  ): Promise<Result<void, DomainError>> {
    const target = await this.resolveSshTarget(context, execution.serverId);
    if (target.isErr()) {
      return err(target.error);
    }

    try {
      const result = this.spawn(
        ["ssh", ...sshArgs(target.value, remoteCommandWithCwd(execution.command, execution.workingDirectory))],
        {
          encoding: "utf8",
          timeout: this.timeoutMs,
        },
      );

      return this.toResult(execution, result);
    } finally {
      target.value.cleanup();
    }
  }

  private async resolveSshTarget(
    context: ExecutionContext,
    serverId: string,
  ): Promise<Result<SshRuntimeControlTarget, DomainError>> {
    if (!this.input.serverRepository) {
      return err(
        domainError.provider(
          "SSH runtime control requires a server repository",
          {
            phase: "runtime-control-execution",
            serverId,
            safeAdapterErrorCode: "runtime_control_server_repository_missing",
          },
          false,
        ),
      );
    }

    const server = await this.input.serverRepository.findOne(
      repositoryContext(context),
      DeploymentTargetByIdSpec.create(DeploymentTargetId.rehydrate(serverId)),
    );
    const serverState = server?.toState();

    if (!serverState) {
      return err(domainError.notFound("server", serverId));
    }

    return ok(this.toSshTarget(serverState));
  }

  private toSshTarget(serverState: DeploymentTargetState): SshRuntimeControlTarget {
    const username = serverState.credential?.username?.value;
    const privateKey = serverState.credential?.privateKey?.value;

    if (serverState.credential?.kind.value === "ssh-private-key" && privateKey) {
      const identity = writeSshIdentityFile(privateKey);
      return {
        host: hostWithUsername(serverState.host.value, username),
        port: String(serverState.port.value),
        identityFile: identity.identityFile,
        cleanup: identity.cleanup,
      };
    }

    return {
      host: hostWithUsername(serverState.host.value, username),
      port: String(serverState.port.value),
      cleanup: () => undefined,
    };
  }

  private toResult(
    execution: RuntimeControlCommandExecution,
    result: RuntimeControlSpawnResult,
  ): Result<void, DomainError> {
    if (result.status === 0 && !result.error) {
      return ok(undefined);
    }

    return err(commandFailure({ execution, result }));
  }

  private get spawn(): RuntimeControlSpawn {
    return this.input.spawn ?? defaultSpawn;
  }

  private get timeoutMs(): number {
    return this.input.timeoutMs ?? 30_000;
  }
}

export class RuntimeResourceRuntimeControlTarget implements ResourceRuntimeControlTargetPort {
  constructor(
    private readonly executor: RuntimeControlCommandExecutor,
    private readonly quote: (value: string) => string = shellQuote,
  ) {}

  async control(
    context: ExecutionContext,
    request: ResourceRuntimeControlTargetRequest,
  ): Promise<Result<ResourceRuntimeControlTargetResult, DomainError>> {
    const plan = planResourceRuntimeControlCommand(request, {
      quote: this.quote,
    });

    if (plan.kind === "blocked") {
      return ok(plan.result);
    }

    const execution = await this.executor.run(context, {
      command: plan.plan.command,
      ...(plan.plan.workingDirectory ? { workingDirectory: plan.plan.workingDirectory } : {}),
      operation: request.operation,
      providerKey: request.providerKey,
      serverId: request.serverId,
    });

    if (execution.isErr()) {
      return err(executionFailure(execution.error));
    }

    return ok({
      status: "succeeded",
      runtimeState: plan.plan.runtimeState,
      ...(plan.plan.phases ? { phases: plan.plan.phases } : {}),
    });
  }
}
