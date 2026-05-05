import {
  type ExecutionContext,
  type ResourceRuntimeControlOperation,
  type ResourceRuntimeControlPhaseSummary,
  type ResourceRuntimeControlRuntimeState,
  type ResourceRuntimeControlTargetPort,
  type ResourceRuntimeControlTargetRequest,
  type ResourceRuntimeControlTargetResult,
} from "@appaloft/application";
import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";

import { deriveRuntimeInstanceNames } from "./runtime-instance-names";

export interface RuntimeControlCommandExecution {
  command: string;
  workingDirectory?: string;
  operation: ResourceRuntimeControlOperation;
}

export interface RuntimeControlCommandExecutor {
  run(
    context: ExecutionContext,
    execution: RuntimeControlCommandExecution,
  ): Promise<Result<void, DomainError>>;
}

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
