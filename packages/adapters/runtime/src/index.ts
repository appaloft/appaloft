import {
  BuildStrategyKindValue,
  CommandText,
  DeploymentTargetDescriptor,
  DeploymentLogEntry,
  DeploymentLogSourceValue,
  DeploymentPhaseValue,
  DetectSummary,
  ErrorCodeText,
  ExecutionStrategyKindValue,
  ExitCode,
  ExecutionResult,
  ExecutionStatusValue,
  FilePathText,
  FinishedAt,
  GeneratedAt,
  HealthCheckPathText,
  ImageReference,
  LogLevelValue,
  MessageText,
  OccurredAt,
  PackagingModeValue,
  PlanStepText,
  PortNumber,
  ProviderKey,
  RuntimeExecutionPlan,
  RuntimePlan,
  RuntimePlanId,
  SourceDescriptor,
  TargetKindValue,
  domainError,
  err,
  ok,
  type Deployment,
  type DeploymentTargetState,
  type EnvironmentSnapshot,
  type Result,
  type RollbackPlan,
} from "@yundu/core";
import {
  createAdapterSpanName,
  deploymentProgressSteps,
  reportDeploymentProgress,
  yunduTraceAttributes,
  type ExecutionContext,
  type AppLogger,
  type DeploymentProgressReporter,
  type ExecutionBackend,
  type RequestedDeploymentConfig,
  type RuntimePlanResolver,
} from "@yundu/application";
import { LocalExecutionBackend } from "./local-execution";
import { SshExecutionBackend } from "./ssh-execution";

export { SshExecutionBackend } from "./ssh-execution";

function resolvePackageManager(source: SourceDescriptor): "npm" | "bun" | "pnpm" {
  const packageManager = source.metadata?.packageManager;

  if (packageManager === "bun" || packageManager === "pnpm" || packageManager === "npm") {
    return packageManager;
  }

  return "npm";
}

function installCommandFor(packageManager: "npm" | "bun" | "pnpm"): string {
  switch (packageManager) {
    case "bun":
      return "bun install";
    case "pnpm":
      return "pnpm install";
    case "npm":
      return "npm install";
  }
}

function runCommandFor(
  packageManager: "npm" | "bun" | "pnpm",
  script: string,
): string {
  switch (packageManager) {
    case "bun":
      return `bun run ${script}`;
    case "pnpm":
      return `pnpm ${script}`;
    case "npm":
      return `npm run ${script}`;
  }
}

function normalizeDockerImage(locator: string): string {
  return locator.replace(/^docker:\/\//, "").replace(/^image:\/\//, "");
}

function chooseStrategies(input: {
  source: SourceDescriptor;
  requestedDeployment: RequestedDeploymentConfig;
}): Result<{
  buildStrategy: BuildStrategyKindValue;
  packagingMode: PackagingModeValue;
  execution: RuntimeExecutionPlan;
  steps: PlanStepText[];
}> {
  const { source, requestedDeployment } = input;
  const packageManager = resolvePackageManager(source);
  const requestedMethod =
    requestedDeployment.method === "auto"
      ? source.kind === "compose"
        ? "docker-compose"
        : source.kind === "docker-image"
          ? "prebuilt-image"
          : requestedDeployment.startCommand ||
              requestedDeployment.buildCommand ||
              requestedDeployment.installCommand
            ? "workspace-commands"
            : source.metadata?.hasDockerfile === "true"
              ? "dockerfile"
              : source.metadata?.hasPackageJson === "true"
                ? "workspace-commands"
                : "auto"
      : requestedDeployment.method;

  if (requestedMethod === "docker-compose") {
    const execution = RuntimeExecutionPlan.rehydrate({
      kind: ExecutionStrategyKindValue.rehydrate("docker-compose-stack"),
      workingDirectory: FilePathText.rehydrate(source.locator),
      composeFile: FilePathText.rehydrate(source.locator),
      ...(requestedDeployment.healthCheckPath
        ? { healthCheckPath: HealthCheckPathText.rehydrate(requestedDeployment.healthCheckPath) }
        : {}),
      ...(requestedDeployment.port ? { port: PortNumber.rehydrate(requestedDeployment.port) } : {}),
    });
    return ok({
      buildStrategy: BuildStrategyKindValue.rehydrate("compose-deploy"),
      packagingMode: PackagingModeValue.rehydrate("compose-bundle"),
      execution,
      steps: [
        PlanStepText.rehydrate("Inspect compose manifest"),
        PlanStepText.rehydrate("Prepare compose bundle"),
        PlanStepText.rehydrate("Run docker compose"),
        PlanStepText.rehydrate("Verify stack"),
      ],
    });
  }

  if (requestedMethod === "prebuilt-image") {
    const execution = RuntimeExecutionPlan.rehydrate({
      kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
      image: ImageReference.rehydrate(normalizeDockerImage(source.locator)),
      ...(requestedDeployment.healthCheckPath
        ? { healthCheckPath: HealthCheckPathText.rehydrate(requestedDeployment.healthCheckPath) }
        : {}),
      ...(requestedDeployment.port ? { port: PortNumber.rehydrate(requestedDeployment.port) } : {}),
    });
    return ok({
      buildStrategy: BuildStrategyKindValue.rehydrate("prebuilt-image"),
      packagingMode: PackagingModeValue.rehydrate("all-in-one-docker"),
      execution,
      steps: [
        PlanStepText.rehydrate("Resolve image reference"),
        PlanStepText.rehydrate("Prepare runtime config"),
        PlanStepText.rehydrate("Run docker container"),
        PlanStepText.rehydrate("Verify container health"),
      ],
    });
  }

  if (requestedMethod === "dockerfile") {
    const execution = RuntimeExecutionPlan.rehydrate({
      kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
      workingDirectory: FilePathText.rehydrate(source.locator),
      dockerfilePath: FilePathText.rehydrate(source.metadata?.dockerfilePath ?? "Dockerfile"),
      ...(requestedDeployment.healthCheckPath
        ? { healthCheckPath: HealthCheckPathText.rehydrate(requestedDeployment.healthCheckPath) }
        : {}),
      ...(requestedDeployment.port ? { port: PortNumber.rehydrate(requestedDeployment.port) } : {}),
    });
    return ok({
      buildStrategy: BuildStrategyKindValue.rehydrate("dockerfile"),
      packagingMode: PackagingModeValue.rehydrate("all-in-one-docker"),
      execution,
      steps: [
        PlanStepText.rehydrate("Build docker image"),
        PlanStepText.rehydrate("Apply environment config"),
        PlanStepText.rehydrate("Run local container"),
        PlanStepText.rehydrate("Verify container health"),
      ],
    });
  }

  if (requestedMethod === "workspace-commands") {
    const startCommand =
      requestedDeployment.startCommand ??
      (source.metadata?.hasStartBuiltScript === "true"
        ? runCommandFor(packageManager, "start:built")
        : source.metadata?.hasStartScript === "true"
          ? runCommandFor(packageManager, "start")
          : undefined);

    if (!startCommand) {
      return err(
        domainError.validation(
          "Workspace command deployments require a start command or a start script",
        ),
      );
    }

    const execution = RuntimeExecutionPlan.rehydrate({
      kind: ExecutionStrategyKindValue.rehydrate("host-process"),
      workingDirectory: FilePathText.rehydrate(source.locator),
      startCommand: CommandText.rehydrate(startCommand),
      ...(() => {
        const installCommand =
          requestedDeployment.installCommand ??
          (source.metadata?.hasPackageJson === "true"
            ? installCommandFor(packageManager)
            : undefined);
        return installCommand ? { installCommand: CommandText.rehydrate(installCommand) } : {};
      })(),
      ...(() => {
        const buildCommand =
          requestedDeployment.buildCommand ??
          (source.metadata?.hasBuildScript === "true"
            ? runCommandFor(packageManager, "build")
            : undefined);
        return buildCommand ? { buildCommand: CommandText.rehydrate(buildCommand) } : {};
      })(),
      ...(requestedDeployment.healthCheckPath
        ? { healthCheckPath: HealthCheckPathText.rehydrate(requestedDeployment.healthCheckPath) }
        : {}),
      ...(requestedDeployment.port ? { port: PortNumber.rehydrate(requestedDeployment.port) } : {}),
    });

    return ok({
      buildStrategy: BuildStrategyKindValue.rehydrate("workspace-commands"),
      packagingMode: PackagingModeValue.rehydrate("host-process-runtime"),
      execution,
      steps: [
        PlanStepText.rehydrate("Install workspace dependencies"),
        PlanStepText.rehydrate("Build application bundle"),
        PlanStepText.rehydrate("Start host process"),
        PlanStepText.rehydrate("Verify process health"),
      ],
    });
  }

  return err(
    domainError.validation(
      "Could not resolve a deployment method automatically. Specify --method and commands explicitly.",
    ),
  );
}

export class DefaultRuntimePlanResolver implements RuntimePlanResolver {
  async resolve(
    context: ExecutionContext,
    input: {
      id: string;
      source: RuntimePlan["source"];
      server: DeploymentTargetState;
      environmentSnapshot: EnvironmentSnapshot;
      detectedReasoning: string[];
      requestedDeployment: RequestedDeploymentConfig;
      generatedAt: string;
    },
  ): Promise<Result<RuntimePlan>> {
    return context.tracer.startActiveSpan(
      createAdapterSpanName("runtime_plan_resolver", "resolve"),
      {
        attributes: {
          [yunduTraceAttributes.sourceLocator]: input.source.locator,
        },
      },
      async () =>
        chooseStrategies({
          source: input.source,
          requestedDeployment: input.requestedDeployment,
        }).andThen((strategy) =>
          RuntimePlan.create({
            id: RuntimePlanId.rehydrate(input.id),
            source: input.source,
            buildStrategy: strategy.buildStrategy,
            packagingMode: strategy.packagingMode,
            execution: strategy.execution,
            target: DeploymentTargetDescriptor.rehydrate({
              kind: TargetKindValue.rehydrate("single-server"),
              providerKey: input.server.providerKey,
              serverIds: [input.server.id],
              metadata: {
                snapshotId: input.environmentSnapshot.toState().id.value,
                ...(input.server.host?.value ? { serverHost: input.server.host.value } : {}),
                ...(input.server.port?.value
                  ? { serverPort: String(input.server.port.value) }
                  : {}),
              },
            }),
            detectSummary: DetectSummary.rehydrate(input.detectedReasoning.join(" | ")),
            steps: strategy.steps,
            generatedAt: GeneratedAt.rehydrate(input.generatedAt),
          }),
        ),
    );
  }
}

interface ExecutionSession {
  deploymentId: string;
  status: "running" | "succeeded" | "failed" | "rolled-back";
  logs: DeploymentLogEntry[];
}

type LogPhase = "detect" | "plan" | "package" | "deploy" | "verify" | "rollback";
type LogLevel = "debug" | "info" | "warn" | "error";

function phaseLog(
  phase: LogPhase,
  message: string,
  level: LogLevel = "info",
): DeploymentLogEntry {
  return DeploymentLogEntry.rehydrate({
    timestamp: OccurredAt.rehydrate(new Date().toISOString()),
    source: DeploymentLogSourceValue.rehydrate("yundu"),
    phase: DeploymentPhaseValue.rehydrate(phase),
    level: LogLevelValue.rehydrate(level),
    message: MessageText.rehydrate(message),
  });
}

function shouldFail(deployment: Deployment): boolean {
  const state = deployment.toState();
  return (
    state.runtimePlan.source.locator.includes("fail") ||
    state.environmentSnapshot.variables.some(
      (variable) =>
        variable.key === "YUNDU_SIMULATE_FAILURE" && variable.value === "true",
    )
  );
}

export class InMemoryExecutionBackend implements ExecutionBackend {
  private readonly sessions = new Map<string, ExecutionSession>();

  constructor(private readonly progressReporter: DeploymentProgressReporter) {}

  private report(
    context: ExecutionContext,
    input: {
      deploymentId: string;
      phase: "detect" | "plan" | "package" | "deploy" | "verify" | "rollback";
      message: string;
      status?: "running" | "succeeded" | "failed";
      level?: "debug" | "info" | "warn" | "error";
    },
  ): void {
    reportDeploymentProgress(this.progressReporter, context, {
      deploymentId: input.deploymentId,
      phase: input.phase,
      message: input.message,
      ...(input.status ? { status: input.status } : {}),
      ...(input.level ? { level: input.level } : {}),
      step: deploymentProgressSteps[input.phase],
    });
  }

  private applyResult(
    deployment: Deployment,
    result: ExecutionResult,
  ): Deployment {
    deployment.applyExecutionResult(FinishedAt.rehydrate(new Date().toISOString()), result);
    this.sessions.set(deployment.toState().id.value, {
      deploymentId: deployment.toState().id.value,
      status: result.status,
      logs: result.logs,
    });
    return deployment;
  }

  async execute(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    const state = deployment.toState();
    return context.tracer.startActiveSpan(
      createAdapterSpanName("in_memory_execution_backend", "execute"),
      {
        attributes: {
          [yunduTraceAttributes.sourceLocator]: state.runtimePlan.source.locator,
        },
      },
      async () => {
        const logs: DeploymentLogEntry[] = [
          phaseLog(
            "detect",
            `Resolved ${state.runtimePlan.source.kind} source ${state.runtimePlan.source.displayName}`,
          ),
          phaseLog(
            "plan",
            `Selected ${state.runtimePlan.buildStrategy} strategy in ${state.runtimePlan.packagingMode} mode`,
          ),
          phaseLog("package", `Prepared deployment bundle for resource ${state.resourceId.value}`),
          phaseLog("deploy", `Applying runtime plan ${state.runtimePlan.id}`),
          phaseLog("verify", `Checking deployment health for resource ${state.resourceId.value}`),
        ];
        for (const log of logs) {
          this.report(context, {
            deploymentId: state.id.value,
            phase: log.phase as "detect" | "plan" | "package" | "deploy" | "verify",
            status: "succeeded",
            message: log.message,
          });
        }

        if (shouldFail(deployment)) {
          const message = "Simulated verification failure triggered by runtime input";
          logs.push(phaseLog("verify", message, "error"));
          this.report(context, {
            deploymentId: state.id.value,
            phase: "verify",
            status: "failed",
            level: "error",
            message,
          });
          return ok({
            deployment: this.applyResult(
              deployment,
              ExecutionResult.rehydrate({
                exitCode: ExitCode.rehydrate(1),
                status: ExecutionStatusValue.rehydrate("failed"),
                logs,
                retryable: true,
                errorCode: ErrorCodeText.rehydrate("simulated_failure"),
              }),
            ),
          });
        }

        logs.push(phaseLog("verify", "Deployment completed successfully"));
        this.report(context, {
          deploymentId: state.id.value,
          phase: "verify",
          status: "succeeded",
          message: "Deployment completed successfully",
        });

        return ok({
          deployment: this.applyResult(
            deployment,
            ExecutionResult.rehydrate({
              exitCode: ExitCode.rehydrate(0),
              status: ExecutionStatusValue.rehydrate("succeeded"),
              logs,
              retryable: false,
            }),
          ),
        });
      },
    );
  }

  async rollback(
    context: ExecutionContext,
    deployment: Deployment,
    plan: RollbackPlan,
  ): Promise<Result<{ deployment: Deployment }>> {
    return context.tracer.startActiveSpan(
      createAdapterSpanName("in_memory_execution_backend", "rollback"),
      {
        attributes: {},
      },
      async () => {
        if (plan.steps.length === 0) {
          return err(domainError.invariant("Rollback plan must contain at least one step"));
        }

        const logs: DeploymentLogEntry[] = [
          phaseLog("rollback", `Loading snapshot ${plan.snapshotId}`),
          phaseLog("rollback", `Executing rollback plan ${plan.id}`),
          phaseLog("rollback", "Rollback completed successfully"),
        ];
        for (const log of logs) {
          this.report(context, {
            deploymentId: deployment.toState().id.value,
            phase: "rollback",
            status: "succeeded",
            message: log.message,
          });
        }

        return ok({
          deployment: this.applyResult(
            deployment,
            ExecutionResult.rehydrate({
              exitCode: ExitCode.rehydrate(0),
              status: ExecutionStatusValue.rehydrate("rolled-back"),
              logs,
              retryable: false,
            }),
          ),
        });
      },
    );
  }

  getSession(id: string): ExecutionSession | undefined {
    return this.sessions.get(id);
  }
}

export class RoutingExecutionBackend implements ExecutionBackend {
  constructor(
    private readonly localBackend: LocalExecutionBackend,
    private readonly sshBackend: SshExecutionBackend,
    private readonly fallbackBackend: ExecutionBackend,
  ) {}

  async execute(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    if (deployment.toState().runtimePlan.target.providerKey === "local-shell") {
      return await this.localBackend.execute(context, deployment);
    }

    if (deployment.toState().runtimePlan.target.providerKey === "generic-ssh") {
      return await this.sshBackend.execute(context, deployment);
    }

    return await this.fallbackBackend.execute(context, deployment);
  }

  async rollback(
    context: ExecutionContext,
    deployment: Deployment,
    plan: RollbackPlan,
  ): Promise<Result<{ deployment: Deployment }>> {
    if (deployment.toState().runtimePlan.target.providerKey === "local-shell") {
      return await this.localBackend.rollback(context, deployment, plan);
    }

    if (deployment.toState().runtimePlan.target.providerKey === "generic-ssh") {
      return await this.sshBackend.rollback(context, deployment, plan);
    }

    return await this.fallbackBackend.rollback(context, deployment, plan);
  }
}

export { LocalExecutionBackend };
