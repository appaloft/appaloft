import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  DeploymentTimelineJournalEntry,
  DeploymentTimelineSourceValue,
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
  type DeploymentTimelineJournalSource,
  type RollbackPlan,
  type Result,
} from "@appaloft/core";
import {
  createDeploymentProgressEvent,
  type ControlPlaneSecretProtector,
  deploymentProofConfigurationFingerprint,
  type DependencyResourceSecretStore,
  deploymentProgressSteps,
  type DeploymentProgressRecorder,
  type DeploymentProgressReporter,
  type ExecutionContext,
  type ResourceAccessFailureRendererTarget,
  type RuntimeTargetBackend,
  type RuntimeTargetBackendDescriptor,
  type RuntimeTargetCapability,
  type ServerRepository,
  toRepositoryContext,
} from "@appaloft/application";
import {
  renderDockerSwarmApplyPlan,
  renderDockerSwarmCleanupPlan,
  renderDockerSwarmRuntimeIntent,
  type DockerSwarmRuntimeIdentityInput,
} from "./docker-swarm-runtime-intent";
import { requireServerBackedDeploymentState } from "./deployment-target";
import {
  runtimeTargetCapacityAwareFailureFields,
} from "./runtime-target-failure-classification";
import { resolveDependencyRuntimeEnvironment } from "./dependency-runtime-secrets";

export interface DockerSwarmCommandRunnerInput {
  context?: ExecutionContext;
  targetId?: string;
  step: string;
  command: string;
  displayCommand: string;
  stdinFile?: string;
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
  processRunner?: DockerSwarmProcessRunner;
  serverRepository?: ServerRepository;
}

export interface DockerSwarmProcessRunnerInput {
  executable: string;
  args: string[];
  step: string;
  stdinFile?: string;
  timeoutMs: number;
}

export interface DockerSwarmProcessRunner {
  run(input: DockerSwarmProcessRunnerInput): Promise<Result<DockerSwarmCommandRunnerResult>>;
}

export interface DockerSwarmExecutionBackendOptions {
  edgeNetworkName?: string;
  resourceAccessFailureRenderer?: () => ResourceAccessFailureRendererTarget | undefined;
}

type SwarmExecutionPhase = "deploy" | "verify" | "rollback";
type SwarmLogLevel = "debug" | "info" | "warn" | "error";
const dockerSwarmShellCommandTimeoutExitCode = 124;
const defaultDockerSwarmShellCommandTimeoutMs = 60_000;

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function commandParts(parts: readonly string[]): string {
  return parts.filter((part) => part.trim().length > 0).join(" ");
}

function phaseLog(
  phase: SwarmExecutionPhase,
  message: string,
  level: SwarmLogLevel = "info",
  source: DeploymentTimelineJournalSource = "appaloft",
): DeploymentTimelineJournalEntry {
  return DeploymentTimelineJournalEntry.rehydrate({
    timestamp: OccurredAt.rehydrate(new Date().toISOString()),
    source: DeploymentTimelineSourceValue.rehydrate(source),
    phase: DeploymentPhaseValue.rehydrate(phase),
    level: LogLevelValue.rehydrate(level),
    message: MessageText.rehydrate(message),
  });
}

function deploymentIdentity(deployment: Deployment): DockerSwarmRuntimeIdentityInput {
  const state = requireServerBackedDeploymentState(deployment, "docker swarm deployment identity");
  return {
    resourceId: state.resourceId.value,
    deploymentId: state.id.value,
    targetId: state.serverId.value,
    destinationId: state.destinationId.value,
    configurationFingerprint: deploymentProofConfigurationFingerprint(
      state.environmentSnapshot.variables,
    ),
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
  timeline: DeploymentTimelineJournalEntry[];
  retryable: boolean;
  errorCode?: string;
  metadata?: Record<string, string>;
}): ExecutionResult {
  return ExecutionResult.rehydrate({
    status: ExecutionStatusValue.rehydrate(input.status),
    exitCode: ExitCode.rehydrate(input.exitCode),
    timeline: input.timeline,
    retryable: input.retryable,
    ...(input.errorCode ? { errorCode: ErrorCodeText.rehydrate(input.errorCode) } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
}

function failedExecutionResult(
  deployment: Deployment,
  input: {
    exitCode: number;
    timeline: DeploymentTimelineJournalEntry[];
    retryable: boolean;
    errorCode: string;
    metadata?: Record<string, string>;
  },
): ExecutionResult {
  const failureFields = runtimeTargetCapacityAwareFailureFields({
    timeline: input.timeline,
    errorCode: input.errorCode,
    ...(input.metadata ? { metadata: input.metadata } : {}),
    serverId: requireServerBackedDeploymentState(
      deployment,
      "docker swarm capacity-aware failure fields",
    ).serverId.value,
  });

  return executionResult({
    status: "failed",
    exitCode: input.exitCode,
    timeline: input.timeline,
    retryable: input.retryable,
    errorCode: failureFields.errorCode,
    ...(failureFields.metadata ? { metadata: failureFields.metadata } : {}),
  });
}

class BunDockerSwarmProcessRunner implements DockerSwarmProcessRunner {
  async run(input: DockerSwarmProcessRunnerInput): Promise<Result<DockerSwarmCommandRunnerResult>> {
    try {
      const process = Bun.spawn([input.executable, ...input.args], {
        stdout: "pipe",
        stderr: "pipe",
        ...(input.stdinFile ? { stdin: Bun.file(input.stdinFile) } : {}),
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

interface DockerSwarmSshTarget {
  host: string;
  port: string;
  identityFile?: string;
  cleanup(): void;
}

function hostWithUsername(host: string, username?: string): string {
  return username && !host.includes("@") ? `${username}@${host}` : host;
}

export class DockerSwarmShellCommandRunner implements DockerSwarmCommandRunner {
  private readonly timeoutMs: number;
  private readonly processRunner: DockerSwarmProcessRunner;

  constructor(private readonly options: DockerSwarmShellCommandRunnerOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? defaultDockerSwarmShellCommandTimeoutMs;
    this.processRunner = options.processRunner ?? new BunDockerSwarmProcessRunner();
  }

  async run(input: DockerSwarmCommandRunnerInput): Promise<Result<DockerSwarmCommandRunnerResult>> {
    if (!this.options.serverRepository) {
      return await this.processRunner.run({
        executable: "sh",
        args: ["-lc", input.command],
        step: input.step,
        ...(input.stdinFile ? { stdinFile: input.stdinFile } : {}),
        timeoutMs: this.timeoutMs,
      });
    }

    const targetResult = await this.resolveSshTarget(input);
    if (targetResult.isErr()) {
      return err(targetResult.error);
    }

    const target = targetResult.value;
    try {
      return await this.processRunner.run({
        executable: "ssh",
        args: [
          "-p",
          target.port,
          ...(target.identityFile
            ? ["-i", target.identityFile, "-o", "IdentitiesOnly=yes"]
            : []),
          "-o",
          "BatchMode=yes",
          "-o",
          "StrictHostKeyChecking=accept-new",
          "-o",
          "ServerAliveInterval=30",
          "-o",
          "ServerAliveCountMax=20",
          target.host,
          input.command,
        ],
        step: input.step,
        ...(input.stdinFile ? { stdinFile: input.stdinFile } : {}),
        timeoutMs: this.timeoutMs,
      });
    } finally {
      target.cleanup();
    }
  }

  private async resolveSshTarget(
    input: DockerSwarmCommandRunnerInput,
  ): Promise<Result<DockerSwarmSshTarget>> {
    if (!input.context || !input.targetId) {
      return err(
        domainError.infra("Docker Swarm registered manager context is unavailable", {
          phase: input.step,
          reason: "swarm-manager-context-unavailable",
        }),
      );
    }

    const server = await this.options.serverRepository?.findOne(
      toRepositoryContext(input.context),
      DeploymentTargetByIdSpec.create(DeploymentTargetId.rehydrate(input.targetId)),
    );
    const state = server?.toState();
    if (!state) {
      return err(
        domainError.infra("Docker Swarm registered manager was not found", {
          phase: input.step,
          reason: "swarm-manager-not-found",
          targetId: input.targetId,
        }),
      );
    }

    let identityDirectory: string | undefined;
    let identityFile: string | undefined;
    const privateKey = state.credential?.privateKey?.value;
    if (state.credential?.kind.value === "ssh-private-key" && privateKey) {
      identityDirectory = mkdtempSync(join(tmpdir(), "appaloft-swarm-ssh-"));
      identityFile = join(identityDirectory, "id_swarm_manager");
      writeFileSync(identityFile, privateKey.endsWith("\n") ? privateKey : `${privateKey}\n`, {
        mode: 0o600,
      });
      chmodSync(identityFile, 0o600);
    }

    return ok({
      host: hostWithUsername(state.host.value, state.credential?.username?.value),
      port: String(state.port.value),
      ...(identityFile ? { identityFile } : {}),
      cleanup: () => {
        if (identityDirectory) {
          rmSync(identityDirectory, { recursive: true, force: true });
        }
      },
    });
  }
}

export class DockerSwarmExecutionBackend implements RuntimeTargetBackend {
  readonly descriptor: RuntimeTargetBackendDescriptor;

  constructor(
    private readonly runner: DockerSwarmCommandRunner,
    capabilities: RuntimeTargetCapability[] = [
      "runtime.apply",
      "runtime.verify",
      "runtime.dependency-secrets",
      "runtime.logs",
      "runtime.health",
      "runtime.cleanup",
      "proxy.route",
    ],
    private readonly options: DockerSwarmExecutionBackendOptions = {},
    private readonly dependencyResourceSecretStore?: DependencyResourceSecretStore,
    private readonly progressRecorder?: DeploymentProgressRecorder,
    private readonly progressReporter?: DeploymentProgressReporter,
    private readonly controlPlaneSecretProtector?: ControlPlaneSecretProtector,
  ) {
    this.descriptor = {
      key: "docker-swarm",
      providerKey: "docker-swarm",
      targetKinds: ["orchestrator-cluster"],
      capabilities: [...capabilities],
    };
  }

  async execute(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    const state = deployment.toState();
    const identity = deploymentIdentity(deployment);
    const runtimeEnvResult = await resolveDependencyRuntimeEnvironment({
      context,
      deployment,
      dependencyResourceSecretStore: this.dependencyResourceSecretStore,
      controlPlaneSecretProtector: this.controlPlaneSecretProtector,
    });
    if (runtimeEnvResult.isErr()) {
      const message = safeFailureMessage(runtimeEnvResult.error.message, deploymentSecretRedactions(deployment));
      return applyExecutionResult(
        deployment,
        failedExecutionResult(deployment, {
          exitCode: 1,
          timeline: [phaseLog("deploy", message, "error")],
          retryable: true,
          errorCode: runtimeEnvResult.error.code,
          metadata: { phase: "dependency-runtime-secret-resolution", message },
        }),
      );
    }

    const runtimeEnv = runtimeEnvResult.value;
    const redactions = [...deploymentSecretRedactions(deployment), ...runtimeEnv.redactions];
    const resourceAccessFailureRenderer = this.options.resourceAccessFailureRenderer?.();
    const intentResult = renderDockerSwarmRuntimeIntent({
      runtimePlan: state.runtimePlan,
      environmentSnapshot: state.environmentSnapshot,
      dependencyBindingReferences: state.dependencyBindingReferences,
      identity,
      ...(this.options.edgeNetworkName ? { edgeNetworkName: this.options.edgeNetworkName } : {}),
      ...(resourceAccessFailureRenderer ? { resourceAccessFailureRenderer } : {}),
    });
    if (intentResult.isErr()) {
      const message = safeFailureMessage(intentResult.error.message, redactions);
      return applyExecutionResult(
        deployment,
        failedExecutionResult(deployment, {
          exitCode: 1,
          timeline: [phaseLog("deploy", message, "error")],
          retryable: false,
          errorCode: intentResult.error.code,
          metadata: { phase: "runtime-target-render", message },
        }),
      );
    }

    const materializedIntent = {
      ...intentResult.value,
      environment: intentResult.value.environment.map((variable) => {
        const value = variable.secret ? runtimeEnv.env[variable.name] : variable.value;
        const { valueFrom: _valueFrom, ...safeIntent } = variable;
        return { ...safeIntent, ...(typeof value === "string" ? { value } : {}) };
      }),
    };
    const applyPlanResult = renderDockerSwarmApplyPlan(materializedIntent);
    if (applyPlanResult.isErr()) {
      const message = safeFailureMessage(applyPlanResult.error.message, redactions);
      return applyExecutionResult(
        deployment,
        failedExecutionResult(deployment, {
          exitCode: 1,
          timeline: [phaseLog("deploy", message, "error")],
          retryable: false,
          errorCode: applyPlanResult.error.code,
          metadata: { phase: "runtime-target-apply", message },
        }),
      );
    }

    const timeline: DeploymentTimelineJournalEntry[] = [];
    for (const step of applyPlanResult.value.steps) {
      const phase = this.phaseForStep(step.step);
      await this.pushTimeline(timeline, context, identity.deploymentId, {
        phase,
        message: step.displayCommand,
        source: "docker",
      });
      const result = await this.runStep(step, context, identity.targetId);

      if (result.isOk()) {
        await this.pushCommandOutput(timeline, {
          context,
          deploymentId: identity.deploymentId,
          phase,
          result: result.value,
          redactions,
        });
      }

      if (result.isErr()) {
        const message = safeFailureMessage(result.error.message, redactions);
        await this.pushTimeline(timeline, context, identity.deploymentId, {
          phase,
          message,
          level: "error",
        });
        await this.cleanupFailedCandidate(context, deployment, timeline, redactions);
        return applyExecutionResult(
          deployment,
          failedExecutionResult(deployment, {
            exitCode: 1,
            timeline,
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
        await this.pushTimeline(timeline, context, identity.deploymentId, {
          phase,
          message,
          level: "error",
        });
        await this.cleanupFailedCandidate(context, deployment, timeline, redactions);
        return applyExecutionResult(
          deployment,
          failedExecutionResult(deployment, {
            exitCode: result.value.exitCode,
            timeline,
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
        timeline: [
          ...timeline,
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
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ timeline: DeploymentTimelineJournalEntry[] }>> {
    const cleanupPlan = renderDockerSwarmCleanupPlan(deploymentIdentity(deployment));
    const timeline: DeploymentTimelineJournalEntry[] = [];
    for (const command of cleanupPlan.commands) {
      const result = await this.runner.run({
        ...command,
        context,
        targetId: deploymentIdentity(deployment).targetId,
      });
      timeline.push(phaseLog("rollback", command.step));
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

    return ok({ timeline });
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
        timeline: cleanup.value.timeline,
        retryable: false,
      }),
    );
  }

  private async runStep(
    step: DockerSwarmCommandRunnerInput,
    context: ExecutionContext,
    targetId: string,
  ): Promise<Result<DockerSwarmCommandRunnerResult>> {
    return await this.runner.run({
      context,
      targetId,
      step: step.step,
      command: step.command,
      displayCommand: step.displayCommand,
      ...(step.stdinFile ? { stdinFile: step.stdinFile } : {}),
    });
  }

  private phaseForStep(step: string): SwarmExecutionPhase {
    return step === "verify-candidate-service" ? "verify" : "deploy";
  }

  private async pushTimeline(
    timeline: DeploymentTimelineJournalEntry[],
    context: ExecutionContext,
    deploymentId: string,
    input: {
      phase: SwarmExecutionPhase;
      message: string;
      level?: SwarmLogLevel;
      source?: DeploymentTimelineJournalSource;
      stream?: "stdout" | "stderr";
    },
  ): Promise<void> {
    const entry = phaseLog(input.phase, input.message, input.level, input.source);
    timeline.push(entry);

    if (!this.progressRecorder || !this.progressReporter) {
      return;
    }

    const event = createDeploymentProgressEvent({
      deploymentId,
      phase: input.phase,
      message: input.message,
      ...(input.level ? { level: input.level } : {}),
      ...(input.source ? { source: input.source } : {}),
      ...(input.stream ? { stream: input.stream } : {}),
      step: deploymentProgressSteps[input.phase],
    });
    await this.progressRecorder.record(context, event).catch(() => undefined);
    this.progressReporter.report(context, event);
  }

  private async pushCommandOutput(
    timeline: DeploymentTimelineJournalEntry[],
    input: {
      context: ExecutionContext;
      deploymentId: string;
      phase: SwarmExecutionPhase;
      result: DockerSwarmCommandRunnerResult;
      redactions: readonly string[];
    },
  ): Promise<void> {
    const outputs = [
      { stream: "stdout" as const, text: input.result.stdout, level: "info" as const },
      { stream: "stderr" as const, text: input.result.stderr, level: "warn" as const },
    ];

    for (const output of outputs) {
      const lines = safeFailureMessage(output.text ?? "", input.redactions)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      for (const line of lines) {
        await this.pushTimeline(timeline, input.context, input.deploymentId, {
          phase: input.phase,
          message: line,
          level: output.level,
          source: "docker",
          stream: output.stream,
        });
      }
    }
  }

  private async cleanupFailedCandidate(
    context: ExecutionContext,
    deployment: Deployment,
    timeline: DeploymentTimelineJournalEntry[],
    redactions: readonly string[],
  ): Promise<void> {
    const cleanupPlan = renderDockerSwarmCleanupPlan(deploymentIdentity(deployment));
    for (const command of cleanupPlan.commands) {
      const result = await this.runner.run({
        ...command,
        context,
        targetId: deploymentIdentity(deployment).targetId,
      });
      timeline.push(phaseLog("rollback", `cleanup-failed-candidate:${command.step}`));
      if (result.isErr()) {
        timeline.push(
          phaseLog("rollback", safeFailureMessage(result.error.message, redactions), "error"),
        );
        return;
      }
      if (result.value.exitCode !== 0) {
        timeline.push(
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
