import {
  AccessRoute,
  BuildStrategyKindValue,
  CommandText,
  DisplayNameText,
  DeploymentTargetDescriptor,
  DeploymentLogEntry,
  DeploymentLogSourceValue,
  DeploymentPhaseValue,
  DetectSummary,
  EdgeProxyKindValue,
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
  PublicDomainName,
  RoutePathPrefix,
  RuntimeExecutionPlan,
  RuntimeVerificationStep,
  RuntimeVerificationStepKindValue,
  RuntimePlan,
  RuntimePlanId,
  safeTry,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
  TargetKindValue,
  TlsModeValue,
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
import { i18nKeys } from "@yundu/i18n";
import { LocalExecutionBackend } from "./local-execution";
import { SshExecutionBackend } from "./ssh-execution";

export { RuntimeServerConnectivityChecker } from "./server-connectivity";
export { RuntimeDeploymentHealthChecker } from "./deployment-health";
export { RuntimeResourceRuntimeLogReader } from "./resource-runtime-logs";
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

function dockerContainerPort(requestedDeployment: RequestedDeploymentConfig): PortNumber {
  return PortNumber.rehydrate(requestedDeployment.port ?? 3000);
}

function ensureSourceDescriptor(source: SourceDescriptor): SourceDescriptor {
  const maybeSource = source as SourceDescriptor & {
    accept?: SourceDescriptor["accept"];
  };
  if (typeof maybeSource.accept === "function") {
    return source;
  }

  return SourceDescriptor.rehydrate({
    kind: SourceKindValue.rehydrate(source.kind),
    locator: SourceLocator.rehydrate(source.locator),
    displayName: DisplayNameText.rehydrate(source.displayName),
    ...(source.metadata ? { metadata: source.metadata } : {}),
  });
}

function hasRequestedWorkspaceCommands(requestedDeployment: RequestedDeploymentConfig): boolean {
  return Boolean(
    requestedDeployment.startCommand ||
      requestedDeployment.buildCommand ||
      requestedDeployment.installCommand,
  );
}

function workspaceMethodFromMetadata(
  source: SourceDescriptor,
  requestedDeployment: RequestedDeploymentConfig,
): RequestedDeploymentConfig["method"] {
  if (hasRequestedWorkspaceCommands(requestedDeployment)) {
    return "workspace-commands";
  }

  if (source.metadata?.hasDockerfile === "true") {
    return "dockerfile";
  }

  if (source.metadata?.hasPackageJson === "true") {
    return "workspace-commands";
  }

  return "auto";
}

function autoDeploymentMethodFor(
  source: SourceDescriptor,
  requestedDeployment: RequestedDeploymentConfig,
): RequestedDeploymentConfig["method"] {
  return ensureSourceDescriptor(source).accept<RequestedDeploymentConfig["method"]>({
    localFolder: (visited) => workspaceMethodFromMetadata(visited, requestedDeployment),
    localGit: (visited) => workspaceMethodFromMetadata(visited, requestedDeployment),
    remoteGit: () => "dockerfile",
    gitPublic: () => "dockerfile",
    gitGithubApp: () => "dockerfile",
    gitDeployKey: () => "dockerfile",
    zipArtifact: (visited) => workspaceMethodFromMetadata(visited, requestedDeployment),
    dockerfileInline: () => "dockerfile",
    dockerComposeInline: () => "docker-compose",
    dockerImage: () => "prebuilt-image",
    compose: () => "docker-compose",
  });
}

function createAccessRoutes(input: {
  requestedDeployment: RequestedDeploymentConfig;
  fallbackPort?: number;
}): Result<AccessRoute[]> {
  const domains = input.requestedDeployment.domains ?? [];
  const proxyKind = input.requestedDeployment.proxyKind ?? (domains.length > 0 ? "traefik" : "none");

  if (proxyKind === "none") {
    if (domains.length > 0) {
      return err(domainError.validation("Access routing domains require an enabled proxy"));
    }

    if (input.requestedDeployment.exposureMode !== "direct-port" || !input.fallbackPort) {
      return ok([]);
    }

    const targetPort = input.fallbackPort;

    return safeTry(function* () {
      const route = yield* AccessRoute.create({
        proxyKind: EdgeProxyKindValue.rehydrate("none"),
        domains: [],
        pathPrefix: yield* RoutePathPrefix.create(input.requestedDeployment.pathPrefix ?? "/"),
        tlsMode: TlsModeValue.rehydrate("disabled"),
        targetPort: PortNumber.rehydrate(targetPort),
      });

      return ok([route]);
    });
  }

  if (domains.length === 0) {
    return err(domainError.validation("Access routing requires at least one domain"));
  }

  return safeTry(function* () {
    const publicDomains: PublicDomainName[] = [];
    for (const domain of domains) {
      publicDomains.push(yield* PublicDomainName.create(domain));
    }

    const route = yield* AccessRoute.create({
      proxyKind: EdgeProxyKindValue.rehydrate(proxyKind),
      domains: publicDomains,
      pathPrefix: yield* RoutePathPrefix.create(input.requestedDeployment.pathPrefix ?? "/"),
      tlsMode: TlsModeValue.rehydrate(input.requestedDeployment.tlsMode ?? "auto"),
      ...(input.fallbackPort ? { targetPort: PortNumber.rehydrate(input.fallbackPort) } : {}),
    });

    return ok([route]);
  });
}

function executionMetadataFor(
  requestedDeployment: RequestedDeploymentConfig,
): Record<string, string> {
  return {
    ...(requestedDeployment.exposureMode
      ? { "resource.exposureMode": requestedDeployment.exposureMode }
      : {}),
    ...(requestedDeployment.upstreamProtocol
      ? { "resource.upstreamProtocol": requestedDeployment.upstreamProtocol }
      : {}),
    ...(requestedDeployment.accessContext?.resourceId
      ? { "resource.id": requestedDeployment.accessContext.resourceId }
      : {}),
    ...(requestedDeployment.accessContext?.resourceSlug
      ? { "resource.slug": requestedDeployment.accessContext.resourceSlug }
      : {}),
    ...(requestedDeployment.accessRouteMetadata ?? {}),
  };
}

function hasEdgeProxyRoute(accessRoutes: AccessRoute[]): boolean {
  return accessRoutes.some((route) => route.proxyKind !== "none");
}

function runtimeVerificationStepsFor(input: {
  execution: RuntimeExecutionPlan;
  accessRoutes: AccessRoute[];
}): RuntimeVerificationStep[] {
  if (input.execution.kind !== "docker-container") {
    return [];
  }

  const internalStep = RuntimeVerificationStep.rehydrate({
    kind: RuntimeVerificationStepKindValue.rehydrate("internal-http"),
    label: PlanStepText.rehydrate("Verify internal container health"),
  });

  if (input.accessRoutes.length === 0) {
    return [internalStep];
  }

  return [
    internalStep,
    RuntimeVerificationStep.rehydrate({
      kind: RuntimeVerificationStepKindValue.rehydrate("public-http"),
      label: PlanStepText.rehydrate("Verify public access route"),
    }),
  ];
}

function runtimePlanStepsFor(input: {
  execution: RuntimeExecutionPlan;
  accessRoutes: AccessRoute[];
  steps: PlanStepText[];
}): PlanStepText[] {
  if (input.execution.kind !== "docker-container") {
    return input.steps;
  }

  const baseSteps = input.steps.slice(0, -1);

  const hasProxy = hasEdgeProxyRoute(input.accessRoutes);

  if (input.accessRoutes.length === 0) {
    return [...baseSteps, PlanStepText.rehydrate("Verify internal container health")];
  }

  return [
    ...baseSteps,
    ...(hasProxy ? [PlanStepText.rehydrate("Configure edge proxy")] : []),
    PlanStepText.rehydrate("Verify internal container health"),
    PlanStepText.rehydrate("Verify public access route"),
  ];
}

function withRequestedAccessRoutes(input: {
  requestedDeployment: RequestedDeploymentConfig;
  buildStrategy: BuildStrategyKindValue;
  packagingMode: PackagingModeValue;
  execution: RuntimeExecutionPlan;
  steps: PlanStepText[];
}): Result<{
  buildStrategy: BuildStrategyKindValue;
  packagingMode: PackagingModeValue;
  execution: RuntimeExecutionPlan;
  steps: PlanStepText[];
}> {
  return createAccessRoutes({
    requestedDeployment: input.requestedDeployment,
    ...(input.execution.port ? { fallbackPort: input.execution.port } : {}),
  }).andThen((accessRoutes) => {
    if (accessRoutes.length > 0 && input.execution.kind !== "docker-container") {
      if (!hasEdgeProxyRoute(accessRoutes)) {
        return ok({
          buildStrategy: input.buildStrategy,
          packagingMode: input.packagingMode,
          execution: input.execution,
          steps: runtimePlanStepsFor({
            execution: input.execution,
            accessRoutes: [],
            steps: input.steps,
          }),
        });
      }

      return err(
        domainError.validation(
          "Access routing is currently supported for Docker container deployments",
        ),
      );
    }

    const metadata = executionMetadataFor(input.requestedDeployment);
    const executionWithMetadata =
      Object.keys(metadata).length > 0 ? input.execution.withMetadata(metadata) : input.execution;
    const execution =
      accessRoutes.length > 0
        ? executionWithMetadata.withAccessRoutes(accessRoutes)
        : executionWithMetadata;
    const verificationSteps = runtimeVerificationStepsFor({
      execution,
      accessRoutes,
    });

    return ok({
      buildStrategy: input.buildStrategy,
      packagingMode: input.packagingMode,
      execution:
        verificationSteps.length > 0 ? execution.withVerificationSteps(verificationSteps) : execution,
      steps: runtimePlanStepsFor({
        execution,
        accessRoutes,
        steps: input.steps,
      }),
    });
  });
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
      ? autoDeploymentMethodFor(source, requestedDeployment)
      : requestedDeployment.method;

  if (requestedMethod === "docker-compose") {
    const composeFile =
      source.kind === "docker-compose-inline"
        ? (source.metadata?.composeFilePath ?? "docker-compose.yml")
        : source.locator;
    const execution = RuntimeExecutionPlan.rehydrate({
      kind: ExecutionStrategyKindValue.rehydrate("docker-compose-stack"),
      workingDirectory: FilePathText.rehydrate(source.locator),
      composeFile: FilePathText.rehydrate(composeFile),
      ...(requestedDeployment.healthCheckPath
        ? { healthCheckPath: HealthCheckPathText.rehydrate(requestedDeployment.healthCheckPath) }
        : {}),
      ...(requestedDeployment.port ? { port: PortNumber.rehydrate(requestedDeployment.port) } : {}),
    });
    return withRequestedAccessRoutes({
      requestedDeployment,
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
    const port = dockerContainerPort(requestedDeployment);
    const execution = RuntimeExecutionPlan.rehydrate({
      kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
      image: ImageReference.rehydrate(normalizeDockerImage(source.locator)),
      ...(requestedDeployment.healthCheckPath
        ? { healthCheckPath: HealthCheckPathText.rehydrate(requestedDeployment.healthCheckPath) }
        : {}),
      port,
    });
    return withRequestedAccessRoutes({
      requestedDeployment,
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
    const port = dockerContainerPort(requestedDeployment);
    const execution = RuntimeExecutionPlan.rehydrate({
      kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
      workingDirectory: FilePathText.rehydrate(source.locator),
      dockerfilePath: FilePathText.rehydrate(source.metadata?.dockerfilePath ?? "Dockerfile"),
      ...(requestedDeployment.healthCheckPath
        ? { healthCheckPath: HealthCheckPathText.rehydrate(requestedDeployment.healthCheckPath) }
        : {}),
      port,
    });
    return withRequestedAccessRoutes({
      requestedDeployment,
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

    return withRequestedAccessRoutes({
      requestedDeployment,
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
          const message = context.t(i18nKeys.backend.progress.simulatedVerificationFailure);
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

        const completedMessage = context.t(i18nKeys.backend.progress.deploymentCompleted);
        logs.push(phaseLog("verify", completedMessage));
        this.report(context, {
          deploymentId: state.id.value,
          phase: "verify",
          status: "succeeded",
          message: completedMessage,
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

  async cancel(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ logs: DeploymentLogEntry[] }>> {
    const deploymentId = deployment.toState().id.value;
    const logs = [phaseLog("deploy", "Canceled in-memory execution")];
    this.sessions.set(deploymentId, {
      deploymentId,
      status: "failed",
      logs,
    });
    this.report(context, {
      deploymentId,
      phase: "deploy",
      status: "succeeded",
      message: "Canceled in-memory execution",
    });
    return ok({ logs });
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
          return err(domainError.invariant(context.t(i18nKeys.backend.progress.rollbackPlanEmpty)));
        }

        const logs: DeploymentLogEntry[] = [
          phaseLog("rollback", `Loading snapshot ${plan.snapshotId}`),
          phaseLog("rollback", `Executing rollback plan ${plan.id}`),
          phaseLog("rollback", context.t(i18nKeys.backend.progress.rollbackCompleted)),
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

  async cancel(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ logs: DeploymentLogEntry[] }>> {
    if (deployment.toState().runtimePlan.target.providerKey === "local-shell") {
      return await this.localBackend.cancel(context, deployment);
    }

    if (deployment.toState().runtimePlan.target.providerKey === "generic-ssh") {
      return await this.sshBackend.cancel(context, deployment);
    }

    return await this.fallbackBackend.cancel(context, deployment);
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
export { RuntimeServerEdgeProxyBootstrapper } from "./server-edge-proxy-bootstrapper";
