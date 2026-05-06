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
  redactScheduledTaskSecretText,
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

export interface DockerSwarmShellCommandRunnerOptions {
  timeoutMs?: number;
}

type SwarmExecutionPhase = "deploy" | "verify" | "rollback";
type SwarmLogLevel = "debug" | "info" | "warn" | "error";
const dockerSwarmShellCommandTimeoutExitCode = 124;
const defaultDockerSwarmShellCommandTimeoutMs = 60_000;

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

function deploymentSecretRedactions(deployment: Deployment): string[] {
  return deployment
    .toState()
    .environmentSnapshot.variables.filter((variable) => variable.isSecret)
    .map((variable) => variable.value)
    .filter((value) => value.length > 0);
}

function safeFailureMessage(message: string, redactions: readonly string[]): string {
  const redactedPrivateKeyBlocks = message.replace(
    /-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----/gi,
    "********",
  );

  return redactScheduledTaskSecretText(redactedPrivateKeyBlocks, redactions)
    .replace(/cookie:\s*[^\s]+/gi, "Cookie: ********")
    .replace(/([?&](?:password|secret|token|api[_-]?key)=)[^&\s]+/gi, "$1********");
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

export class DockerSwarmShellCommandRunner implements DockerSwarmCommandRunner {
  private readonly timeoutMs: number;

  constructor(options: DockerSwarmShellCommandRunnerOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? defaultDockerSwarmShellCommandTimeoutMs;
  }

  async run(input: DockerSwarmCommandRunnerInput): Promise<Result<DockerSwarmCommandRunnerResult>> {
    try {
      const process = Bun.spawn(["sh", "-lc", input.command], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdoutPromise = new Response(process.stdout).text();
      const stderrPromise = new Response(process.stderr).text();
      let timeout: Timer | undefined;
      const timedOut = new Promise<"timeout">((resolve) => {
        timeout = setTimeout(() => resolve("timeout"), this.timeoutMs);
      });
      const outcome = await Promise.race([process.exited, timedOut]);
      if (timeout) {
        clearTimeout(timeout);
      }

      if (outcome === "timeout") {
        process.kill();
        const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
        return ok({
          exitCode: dockerSwarmShellCommandTimeoutExitCode,
          stdout,
          stderr: stderr || `Docker Swarm command timed out at ${input.step}.`,
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
        domainError.infra(
          error instanceof Error ? error.message : "Docker Swarm command runner failed",
          {
            phase: input.step,
          },
        ),
      );
    }
  }
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
    const redactions = deploymentSecretRedactions(deployment);
    const intentResult = renderDockerSwarmRuntimeIntent({
      runtimePlan: state.runtimePlan,
      environmentSnapshot: state.environmentSnapshot,
      identity,
    });
    if (intentResult.isErr()) {
      const message = safeFailureMessage(intentResult.error.message, redactions);
      return applyExecutionResult(
        deployment,
        executionResult({
          status: "failed",
          exitCode: 1,
          logs: [phaseLog("deploy", message, "error")],
          retryable: false,
          errorCode: intentResult.error.code,
          metadata: { phase: "runtime-target-render", message },
        }),
      );
    }

    const applyPlanResult = renderDockerSwarmApplyPlan(intentResult.value);
    if (applyPlanResult.isErr()) {
      const message = safeFailureMessage(applyPlanResult.error.message, redactions);
      return applyExecutionResult(
        deployment,
        executionResult({
          status: "failed",
          exitCode: 1,
          logs: [phaseLog("deploy", message, "error")],
          retryable: false,
          errorCode: applyPlanResult.error.code,
          metadata: { phase: "runtime-target-apply", message },
        }),
      );
    }

    const logs: DeploymentLogEntry[] = [];
    for (const step of applyPlanResult.value.steps) {
      const result = await this.runStep(step);
      logs.push(phaseLog(step.step === "verify-candidate-service" ? "verify" : "deploy", step.step));

      if (result.isErr()) {
        const message = safeFailureMessage(result.error.message, redactions);
        logs.push(phaseLog("deploy", message, "error"));
        await this.cleanupFailedCandidate(deployment, logs, redactions);
        return applyExecutionResult(
          deployment,
          executionResult({
            status: "failed",
            exitCode: 1,
            logs,
            retryable: true,
            errorCode: result.error.code,
            metadata: { phase: step.step, message },
          }),
        );
      }

      if (result.value.exitCode !== 0) {
        const message = safeFailureMessage(
          result.value.stderr ?? `Docker Swarm command failed at ${step.step}`,
          redactions,
        );
        logs.push(phaseLog("deploy", message, "error"));
        await this.cleanupFailedCandidate(deployment, logs, redactions);
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
    redactions: readonly string[],
  ): Promise<void> {
    const cleanupPlan = renderDockerSwarmCleanupPlan(deploymentIdentity(deployment));
    for (const command of cleanupPlan.commands) {
      const result = await this.runner.run(command);
      logs.push(phaseLog("rollback", `cleanup-failed-candidate:${command.step}`));
      if (result.isErr()) {
        logs.push(
          phaseLog("rollback", safeFailureMessage(result.error.message, redactions), "error"),
        );
        return;
      }
      if (result.value.exitCode !== 0) {
        logs.push(
          phaseLog(
            "rollback",
            safeFailureMessage(
              result.value.stderr ?? `Docker Swarm cleanup failed at ${command.step}`,
              redactions,
            ),
            "error",
          ),
        );
        return;
      }
    }
  }
}
