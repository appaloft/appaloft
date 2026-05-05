import {
  DeploymentLogEntry,
  DeploymentLogSourceValue,
  DeploymentPhaseValue,
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
  type Deployment,
  type RollbackPlan,
  type Result,
} from "@appaloft/core";
import {
  type ExecutionContext,
  type RuntimeTargetBackend,
  type RuntimeTargetBackendDescriptor,
  type RuntimeTargetCapability,
} from "@appaloft/application";
import {
  renderDockerSwarmApplyPlan,
  renderDockerSwarmCleanupPlan,
  renderDockerSwarmRuntimeIntent,
  type DockerSwarmApplyPlanStep,
  type DockerSwarmRuntimeIdentityInput,
} from "./docker-swarm-runtime-intent";

export interface DockerSwarmCommandRunnerInput {
  step: string;
  command: string;
  displayCommand: string;
}

export interface DockerSwarmCommandRunnerResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}

export interface DockerSwarmCommandRunner {
  run(input: DockerSwarmCommandRunnerInput): Promise<Result<DockerSwarmCommandRunnerResult>>;
}

type SwarmExecutionPhase = "deploy" | "verify" | "rollback";
type SwarmLogLevel = "debug" | "info" | "warn" | "error";

function phaseLog(
  phase: SwarmExecutionPhase,
  message: string,
  level: SwarmLogLevel = "info",
): DeploymentLogEntry {
  return DeploymentLogEntry.rehydrate({
    timestamp: OccurredAt.rehydrate(new Date().toISOString()),
    source: DeploymentLogSourceValue.rehydrate("appaloft"),
    phase: DeploymentPhaseValue.rehydrate(phase),
    level: LogLevelValue.rehydrate(level),
    message: MessageText.rehydrate(message),
  });
}

function deploymentIdentity(deployment: Deployment): DockerSwarmRuntimeIdentityInput {
  const state = deployment.toState();
  return {
    resourceId: state.resourceId.value,
    deploymentId: state.id.value,
    targetId: state.serverId.value,
    destinationId: state.destinationId.value,
  };
}

function applyExecutionResult(
  deployment: Deployment,
  result: ExecutionResult,
): Result<{ deployment: Deployment }> {
  return deployment
    .applyExecutionResult(FinishedAt.rehydrate(new Date().toISOString()), result)
    .map(() => ({ deployment }));
}

function executionResult(input: {
  status: "succeeded" | "failed" | "rolled-back";
  exitCode: number;
  logs: DeploymentLogEntry[];
  retryable: boolean;
  errorCode?: string;
  metadata?: Record<string, string>;
}): ExecutionResult {
  return ExecutionResult.rehydrate({
    status: ExecutionStatusValue.rehydrate(input.status),
    exitCode: ExitCode.rehydrate(input.exitCode),
    logs: input.logs,
    retryable: input.retryable,
    ...(input.errorCode ? { errorCode: ErrorCodeText.rehydrate(input.errorCode) } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
}

export class DockerSwarmExecutionBackend implements RuntimeTargetBackend {
  readonly descriptor: RuntimeTargetBackendDescriptor;

  constructor(
    private readonly runner: DockerSwarmCommandRunner,
    capabilities: RuntimeTargetCapability[] = [
      "runtime.apply",
      "runtime.verify",
      "runtime.cleanup",
      "proxy.route",
    ],
  ) {
    this.descriptor = {
      key: "docker-swarm",
      providerKey: "docker-swarm",
      targetKinds: ["orchestrator-cluster"],
      capabilities: [...capabilities],
    };
  }

  async execute(
    _context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    const state = deployment.toState();
    const identity = deploymentIdentity(deployment);
    const intentResult = renderDockerSwarmRuntimeIntent({
      runtimePlan: state.runtimePlan,
      environmentSnapshot: state.environmentSnapshot,
      identity,
    });
    if (intentResult.isErr()) {
      return applyExecutionResult(
        deployment,
        executionResult({
          status: "failed",
          exitCode: 1,
          logs: [phaseLog("deploy", intentResult.error.message, "error")],
          retryable: false,
          errorCode: intentResult.error.code,
          metadata: { phase: "runtime-target-render", message: intentResult.error.message },
        }),
      );
    }

    const applyPlanResult = renderDockerSwarmApplyPlan(intentResult.value);
    if (applyPlanResult.isErr()) {
      return applyExecutionResult(
        deployment,
        executionResult({
          status: "failed",
          exitCode: 1,
          logs: [phaseLog("deploy", applyPlanResult.error.message, "error")],
          retryable: false,
          errorCode: applyPlanResult.error.code,
          metadata: { phase: "runtime-target-apply", message: applyPlanResult.error.message },
        }),
      );
    }

    const logs: DeploymentLogEntry[] = [];
    for (const step of applyPlanResult.value.steps) {
      const result = await this.runStep(step);
      logs.push(phaseLog(step.step === "verify-candidate-service" ? "verify" : "deploy", step.step));

      if (result.isErr()) {
        logs.push(phaseLog("deploy", result.error.message, "error"));
        await this.cleanupFailedCandidate(deployment, logs);
        return applyExecutionResult(
          deployment,
          executionResult({
            status: "failed",
            exitCode: 1,
            logs,
            retryable: true,
            errorCode: result.error.code,
            metadata: { phase: step.step, message: result.error.message },
          }),
        );
      }

      if (result.value.exitCode !== 0) {
        const message = result.value.stderr ?? `Docker Swarm command failed at ${step.step}`;
        logs.push(phaseLog("deploy", message, "error"));
        await this.cleanupFailedCandidate(deployment, logs);
        return applyExecutionResult(
          deployment,
          executionResult({
            status: "failed",
            exitCode: result.value.exitCode,
            logs,
            retryable: true,
            errorCode: "docker_swarm_command_failed",
            metadata: { phase: step.step, message },
          }),
        );
      }
    }

    return applyExecutionResult(
      deployment,
      executionResult({
        status: "succeeded",
        exitCode: 0,
        logs: [
          ...logs,
          phaseLog("deploy", `Docker Swarm candidate service ${intentResult.value.serviceName} applied`),
        ],
        retryable: false,
        metadata: {
          "swarm.stackName": intentResult.value.stackName,
          "swarm.serviceName": intentResult.value.serviceName,
          "swarm.applyPlanSchemaVersion": applyPlanResult.value.schemaVersion,
        },
      }),
    );
  }

  async cancel(
    _context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ logs: DeploymentLogEntry[] }>> {
    const cleanupPlan = renderDockerSwarmCleanupPlan(deploymentIdentity(deployment));
    const logs: DeploymentLogEntry[] = [];
    for (const command of cleanupPlan.commands) {
      const result = await this.runner.run(command);
      logs.push(phaseLog("rollback", command.step));
      if (result.isErr()) {
        return err(result.error);
      }
      if (result.value.exitCode !== 0) {
        return err(
          domainError.infra("Docker Swarm cleanup command failed", {
            phase: command.step,
            exitCode: result.value.exitCode,
          }),
        );
      }
    }

    return ok({ logs });
  }

  async rollback(
    context: ExecutionContext,
    deployment: Deployment,
    _plan: RollbackPlan,
  ): Promise<Result<{ deployment: Deployment }>> {
    const cleanup = await this.cancel(context, deployment);
    if (cleanup.isErr()) {
      return err(cleanup.error);
    }

    return applyExecutionResult(
      deployment,
      executionResult({
        status: "rolled-back",
        exitCode: 0,
        logs: cleanup.value.logs,
        retryable: false,
      }),
    );
  }

  private async runStep(
    step: DockerSwarmApplyPlanStep,
  ): Promise<Result<DockerSwarmCommandRunnerResult>> {
    return await this.runner.run({
      step: step.step,
      command: step.command,
      displayCommand: step.displayCommand,
    });
  }

  private async cleanupFailedCandidate(
    deployment: Deployment,
    logs: DeploymentLogEntry[],
  ): Promise<void> {
    const cleanupPlan = renderDockerSwarmCleanupPlan(deploymentIdentity(deployment));
    for (const command of cleanupPlan.commands) {
      const result = await this.runner.run(command);
      logs.push(phaseLog("rollback", `cleanup-failed-candidate:${command.step}`));
      if (result.isErr()) {
        logs.push(phaseLog("rollback", result.error.message, "error"));
        return;
      }
      if (result.value.exitCode !== 0) {
        logs.push(
          phaseLog(
            "rollback",
            result.value.stderr ?? `Docker Swarm cleanup failed at ${command.step}`,
            "error",
          ),
        );
        return;
      }
    }
  }
}
