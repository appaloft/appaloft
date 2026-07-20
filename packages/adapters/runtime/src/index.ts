import {
  AccessRoute,
  BuildStrategyKindValue,
  CanonicalRedirectStatusCode,
  CommandText,
  DisplayNameText,
  DeploymentTargetDescriptor,
  DeploymentTimelineJournalEntry,
  DeploymentTimelineSourceValue,
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
  HealthCheckExpectedStatusCode,
  HealthCheckHostText,
  HealthCheckHttpMethodValue,
  HealthCheckIntervalSeconds,
  HealthCheckPathText,
  HealthCheckResponseText,
  HealthCheckRetryCount,
  HealthCheckSchemeValue,
  HealthCheckStartPeriodSeconds,
  HealthCheckTimeoutSeconds,
  HealthCheckTypeValue,
  ImageReference,
  LogLevelValue,
  MessageText,
  OccurredAt,
  PackagingModeValue,
  PlanStepText,
  PortNumber,
  ProviderKey,
  PublicDomainName,
  RoutePathHandlingValue,
  RoutePathPrefix,
  ResourceServiceName,
  RuntimeArtifactIntentValue,
  RuntimeArtifactKindValue,
  RuntimeArtifactSnapshot,
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
} from "@appaloft/core";
import {
  createAdapterSpanName,
  createDeploymentProgressEvent,
  deploymentProgressSteps,
  appaloftTraceAttributes,
  type ExecutionContext,
  type AppLogger,
  type DeploymentProgressRecorder,
  type DeploymentProgressReporter,
  type ExecutionBackend,
  type RequestedDeploymentConfig,
  type RuntimeTargetBackend,
  type RuntimeTargetBackendDescriptor,
  type RuntimeTargetBackendRegistry,
  type RuntimeTargetBackendSelection,
  type RuntimeTargetCapability,
  type RuntimePlanResolver,
} from "@appaloft/application";
import { i18nKeys } from "@appaloft/i18n";
import { basename, dirname } from "node:path";
import { LocalExecutionBackend } from "./local-execution";
import { SshExecutionBackend } from "./ssh-execution";
import { resolveStaticFrameworkPlan } from "./workspace-planners/javascript/static-frameworks";
import { resolveWorkspaceRuntimePlan } from "./workspace-planners";
import {
  generatedReplicatedWorkloadComposeFile,
  generatedServiceGraphComposeFile,
} from "./service-graph-compose";

export { RuntimeServerConnectivityChecker } from "./server-connectivity";
export { RuntimeDeploymentHealthChecker } from "./deployment-health";
export {
  deploymentProofEvidenceFromDockerInspect,
  readDeploymentProofManagedRouteEvidence,
  RuntimeDeploymentProofEvidenceReader,
  type DockerInspectState,
  type DeploymentProofRouteFetch,
} from "./deployment-proof-evidence";
export { RuntimeResourceHealthProbeRunner } from "./resource-health-probes";
export {
  dockerComposeRuntimeControlCommand,
  dockerContainerRuntimeControlCommand,
  planResourceRuntimeControlCommand,
  RuntimeControlShellCommandExecutor,
  RuntimeResourceRuntimeControlTarget,
  type RuntimeControlCommandExecution,
  type RuntimeControlCommandExecutor,
  type RuntimeControlCommandPlan,
  type RuntimeControlSpawn,
  type RuntimeControlSpawnOptions,
  type RuntimeControlSpawnResult,
} from "./resource-runtime-control-target";
export { RuntimeResourceRuntimeLogReader } from "./resource-runtime-logs";
export {
  renderDockerSwarmApplyPlan,
  renderDockerSwarmCleanupPlan,
  renderDockerSwarmDependencySecretName,
  renderDockerSwarmRuntimeIntent,
  type DockerSwarmApplyPlan,
  type DockerSwarmApplyPlanStep,
  type DockerSwarmApplyPlanStepName,
  type DockerSwarmCleanupCommand,
  type DockerSwarmCleanupPlan,
  type DockerSwarmComposeWorkloadIntent,
  type DockerSwarmEnvironmentVariableIntent,
  type DockerSwarmHealthIntent,
  type DockerSwarmImageWorkloadIntent,
  type DockerSwarmMountIntent,
  type DockerSwarmRouteIntent,
  type DockerSwarmRuntimeIdentityInput,
  type DockerSwarmRuntimeIntent,
  type DockerSwarmRuntimeIntentInput,
  type DockerSwarmWorkloadIntent,
} from "./docker-swarm-runtime-intent";
export {
  DockerSwarmExecutionBackend,
  DockerSwarmShellCommandRunner,
  type DockerSwarmCommandRunner,
  type DockerSwarmCommandRunnerInput,
  type DockerSwarmCommandRunnerResult,
  type DockerSwarmProcessRunner,
  type DockerSwarmProcessRunnerInput,
  type DockerSwarmShellCommandRunnerOptions,
} from "./docker-swarm-execution-backend";
export {
  HermeticScheduledTaskRuntimePort,
  renderDockerContainerScheduledTaskCommand,
  RuntimeTargetScheduledTaskRuntimePort,
  type DockerContainerScheduledTaskCommandInput,
  type HermeticScheduledTaskRuntimeOptions,
  type ScheduledTaskCommandRunner,
  type ScheduledTaskCommandRunnerInput,
  type ScheduledTaskCommandRunnerResult,
  type RuntimeTargetScheduledTaskRuntimeOptions,
  type ScheduledTaskProcessRunner,
  type ScheduledTaskProcessRunnerInput,
} from "./scheduled-task-runtime";
export {
  parseDockerSizeToBytes,
  parseRuntimeTargetCapacityOutput,
  parseRuntimeTargetCapacityPruneOutput,
  renderRuntimeTargetCapacityScript,
  renderRuntimeTargetCapacityPruneScript,
  RuntimeTargetCapacityInspectorAdapter,
  RuntimeTargetCapacityPrunerAdapter,
} from "./runtime-target-capacity";
export {
  parseStorageRuntimeCleanupOutput,
  renderStorageRuntimeCleanupScript,
  StorageRuntimeCleanerAdapter,
} from "./storage-runtime-cleanup";
export {
  DockerSqliteOnlineStorageBackupSourceAdapter,
  DockerTarStorageBackupSourceAdapter,
  LocalFilesystemStorageBackupTargetProvider,
  S3CompatibleStorageBackupTargetProvider,
  PosixShellDockerStorageBackupRuntimeCommandRenderer,
  renderDockerVolumeTarBackupScript,
  renderDockerVolumeSqliteOnlineBackupScript,
  renderLocalFilesystemRestoreBackupScript,
  renderLocalFilesystemStoreBackupScript,
  renderS3CompatibleRestoreBackupScript,
  renderS3CompatibleStoreBackupScript,
  RuntimeStorageBackupProviderRegistry,
  type DockerVolumeSqliteOnlineBackupScriptInput,
  type DockerVolumeTarBackupScriptInput,
  type LocalFilesystemRestoreBackupScriptInput,
  type LocalFilesystemStoreBackupScriptInput,
  type S3CompatibleRestoreBackupScriptInput,
  type S3CompatibleStoreBackupScriptInput,
  type StorageBackupRuntimeCommandDialect,
  type StorageBackupRuntimeCommandRenderer,
  type StorageBackupRuntimeProviderOptions,
} from "./storage-volume-backup-provider";
export {
  RuntimeUsageCapacityInspectorAdapter,
  translateCapacityInspectionToRuntimeUsage,
  type RuntimeUsageServerResolver,
} from "./runtime-usage";
export {
  classifyRuntimeTargetCapacityFailure,
  classifyRuntimeTargetCapacityFailureFromText,
  runtimeTargetCapacityFailureMetadata,
  type RuntimeTargetCapacityFailureClassification,
  type RuntimeTargetCapacityFailureLog,
  type RuntimeTargetCapacityResource,
} from "./runtime-target-failure-classification";
export { RuntimeTerminalSessionGateway } from "./terminal-sessions";
export { SshExecutionBackend } from "./ssh-execution";
export * from "./runtime-commands";

function normalizeDockerImage(locator: string): string {
  return locator.replace(/^docker:\/\//, "").replace(/^image:\/\//, "");
}

function imageRuntimeArtifact(input: {
  intent: "build-image" | "prebuilt-image";
  image?: string;
  metadata?: Record<string, string>;
}): RuntimeArtifactSnapshot {
  return RuntimeArtifactSnapshot.rehydrate({
    kind: RuntimeArtifactKindValue.rehydrate("image"),
    intent: RuntimeArtifactIntentValue.rehydrate(input.intent),
    ...(input.image ? { image: ImageReference.rehydrate(input.image) } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
}

function composeRuntimeArtifact(input: {
  composeFile: string;
  metadata?: Record<string, string>;
}): RuntimeArtifactSnapshot {
  return RuntimeArtifactSnapshot.rehydrate({
    kind: RuntimeArtifactKindValue.rehydrate("compose-project"),
    intent: RuntimeArtifactIntentValue.rehydrate("compose-project"),
    composeFile: FilePathText.rehydrate(input.composeFile),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
}

function dockerContainerPort(requestedDeployment: RequestedDeploymentConfig): PortNumber {
  return PortNumber.rehydrate(requestedDeployment.port ?? 3000);
}

function looksLikeComposeFile(locator: string): boolean {
  return /(^|[/\\])(compose|docker-compose)\.ya?ml$/iu.test(locator);
}

function composeSourcePaths(
  source: SourceDescriptor,
  requestedDeployment: RequestedDeploymentConfig,
): { composeFile: string; workingDirectory: string } {
  const sourceLocatorIsComposeFile = source.kind === "compose" && looksLikeComposeFile(source.locator);
  if (source.kind === "docker-compose-inline") {
    return {
      composeFile:
        source.inspection?.composeFilePath ?? source.metadata?.composeFilePath ?? "docker-compose.yml",
      workingDirectory: source.locator,
    };
  }

  const configuredComposeFile =
    requestedDeployment.dockerComposeFilePath ??
    source.inspection?.composeFilePath ??
    source.metadata?.composeFilePath;
  if (configuredComposeFile) {
    return {
      composeFile: configuredComposeFile,
      workingDirectory: sourceLocatorIsComposeFile ? dirname(source.locator) : source.locator,
    };
  }

  if (sourceLocatorIsComposeFile) {
    return {
      composeFile: basename(source.locator),
      workingDirectory: dirname(source.locator),
    };
  }

  return {
    composeFile: source.locator,
    workingDirectory: source.locator,
  };
}

function runtimeHealthCheckFields(requestedDeployment: RequestedDeploymentConfig) {
  const healthCheck = requestedDeployment.healthCheck;
  const healthCheckPath = healthCheck?.http?.path ?? requestedDeployment.healthCheckPath;

  return {
    ...(healthCheckPath ? { healthCheckPath: HealthCheckPathText.rehydrate(healthCheckPath) } : {}),
    ...(healthCheck
      ? {
          healthCheck: {
            enabled: healthCheck.enabled,
            type: HealthCheckTypeValue.rehydrate(healthCheck.type),
            intervalSeconds: HealthCheckIntervalSeconds.rehydrate(healthCheck.intervalSeconds),
            timeoutSeconds: HealthCheckTimeoutSeconds.rehydrate(healthCheck.timeoutSeconds),
            retries: HealthCheckRetryCount.rehydrate(healthCheck.retries),
            startPeriodSeconds: HealthCheckStartPeriodSeconds.rehydrate(
              healthCheck.startPeriodSeconds,
            ),
            ...(healthCheck.http
              ? {
                  http: {
                    method: HealthCheckHttpMethodValue.rehydrate(healthCheck.http.method),
                    scheme: HealthCheckSchemeValue.rehydrate(healthCheck.http.scheme),
                    host: HealthCheckHostText.rehydrate(healthCheck.http.host),
                    ...(healthCheck.http.port
                      ? { port: PortNumber.rehydrate(healthCheck.http.port) }
                      : {}),
                    path: HealthCheckPathText.rehydrate(healthCheck.http.path),
                    expectedStatusCode: HealthCheckExpectedStatusCode.rehydrate(
                      healthCheck.http.expectedStatusCode,
                    ),
                    ...(healthCheck.http.expectedResponseText
                      ? {
                          expectedResponseText: HealthCheckResponseText.rehydrate(
                            healthCheck.http.expectedResponseText,
                          ),
                        }
                      : {}),
                  },
                }
              : {}),
            ...(healthCheck.command
              ? { command: { command: CommandText.rehydrate(healthCheck.command.command) } }
              : {}),
          },
        }
      : {}),
  };
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

function workspaceMethodFromInspection(
  source: SourceDescriptor,
  requestedDeployment: RequestedDeploymentConfig,
): RequestedDeploymentConfig["method"] {
  if (requestedDeployment.publishDirectory) {
    return "static";
  }

  if (requestedDeployment.startCommand) {
    return "workspace-commands";
  }

  if (source.inspection?.hasDetectedFile("dockerfile")) {
    return "dockerfile";
  }

  if (resolveStaticFrameworkPlan({ source, requestedDeployment })) {
    return "static";
  }

  if (hasRequestedWorkspaceCommands(requestedDeployment)) {
    return "workspace-commands";
  }

  if (source.inspection?.runtimeFamily || source.inspection?.hasDetectedFile("package-json")) {
    return "workspace-commands";
  }

  return "auto";
}

function autoDeploymentMethodFor(
  source: SourceDescriptor,
  requestedDeployment: RequestedDeploymentConfig,
): RequestedDeploymentConfig["method"] {
  return ensureSourceDescriptor(source).accept<RequestedDeploymentConfig["method"]>({
    localFolder: (visited) => workspaceMethodFromInspection(visited, requestedDeployment),
    localGit: (visited) => workspaceMethodFromInspection(visited, requestedDeployment),
    remoteGit: () => "dockerfile",
    gitPublic: () => "dockerfile",
    gitGithubApp: () => "dockerfile",
    gitDeployKey: () => "dockerfile",
    zipArtifact: (visited) => workspaceMethodFromInspection(visited, requestedDeployment),
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
  const requestedAccessRoutes = input.requestedDeployment.accessRoutes ?? [];

  if (requestedAccessRoutes.length > 0) {
    return safeTry(function* () {
      const accessRoutes: AccessRoute[] = [];

      for (const requestedAccessRoute of requestedAccessRoutes) {
        if (requestedAccessRoute.proxyKind === "none") {
          return err(domainError.validation("Access routing domains require an enabled proxy"));
        }

        if (requestedAccessRoute.domains.length === 0) {
          return err(domainError.validation("Access routing requires at least one domain"));
        }

        const publicDomains: PublicDomainName[] = [];
        for (const domain of requestedAccessRoute.domains) {
          publicDomains.push(yield* PublicDomainName.create(domain));
        }

        accessRoutes.push(
          yield* AccessRoute.create({
            proxyKind: EdgeProxyKindValue.rehydrate(requestedAccessRoute.proxyKind),
            domains: publicDomains,
            pathPrefix: yield* RoutePathPrefix.create(requestedAccessRoute.pathPrefix),
            pathHandling: RoutePathHandlingValue.rehydrate(
              requestedAccessRoute.pathHandling ?? "preserve",
            ),
            tlsMode: TlsModeValue.rehydrate(requestedAccessRoute.tlsMode),
            ...(requestedAccessRoute.targetServiceName
              ? {
                  targetServiceName: yield* ResourceServiceName.create(
                    requestedAccessRoute.targetServiceName,
                  ),
                }
              : {}),
            ...(() => {
              const selectedService = requestedAccessRoute.targetServiceName
                ? input.requestedDeployment.services?.find(
                    (service) => service.name === requestedAccessRoute.targetServiceName,
                  )
                : undefined;
              const targetPort = selectedService?.network?.internalPort ?? input.fallbackPort;
              return targetPort ? { targetPort: PortNumber.rehydrate(targetPort) } : {};
            })(),
            ...(requestedAccessRoute.redirectTo
              ? { redirectTo: yield* PublicDomainName.create(requestedAccessRoute.redirectTo) }
              : {}),
            ...(requestedAccessRoute.redirectStatus
              ? {
                  redirectStatus: yield* CanonicalRedirectStatusCode.create(
                    requestedAccessRoute.redirectStatus,
                  ),
                }
              : {}),
          }),
        );
      }

      return ok(accessRoutes);
    });
  }

  const domains = input.requestedDeployment.domains ?? [];
  const proxyKind = input.requestedDeployment.proxyKind ?? (domains.length > 0 ? "traefik" : "none");

  if (proxyKind === "none") {
    if (domains.length > 0) {
      return err(domainError.validation("Access routing domains require an enabled proxy"));
    }

    if (input.requestedDeployment.exposureMode !== "direct-port" || !input.fallbackPort) {
      return ok([]);
    }

    const targetPort = input.requestedDeployment.hostPort ?? input.fallbackPort;

    return safeTry(function* () {
      const route = yield* AccessRoute.create({
        proxyKind: EdgeProxyKindValue.rehydrate("none"),
        domains: [],
        pathPrefix: yield* RoutePathPrefix.create(input.requestedDeployment.pathPrefix ?? "/"),
        pathHandling: RoutePathHandlingValue.rehydrate(
          input.requestedDeployment.pathHandling ?? "preserve",
        ),
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
      pathHandling: RoutePathHandlingValue.rehydrate(
        input.requestedDeployment.pathHandling ?? "preserve",
      ),
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
    ...(requestedDeployment.hostPort
      ? { "resource.hostPort": String(requestedDeployment.hostPort) }
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
    ...(requestedDeployment.storageMounts && requestedDeployment.storageMounts.length > 0
      ? {
          "storage.mounts": JSON.stringify(
            requestedDeployment.storageMounts.map((mount) => ({
              attachmentId: mount.attachmentId,
              storageVolumeId: mount.storageVolumeId,
              storageVolumeKind: mount.storageVolumeKind,
              ...(mount.sourcePath ? { sourcePath: mount.sourcePath } : {}),
              destinationPath: mount.destinationPath,
              mountMode: mount.mountMode,
            })),
          ),
        }
      : {}),
    ...(requestedDeployment.runtimeMetadata ?? {}),
    ...(requestedDeployment.accessRouteMetadata ?? {}),
  };
}

function selectedPlannerMetadata(
  metadata: Record<string, string>,
  keys: readonly string[],
): Record<string, string> {
  const selected: Record<string, string> = {};

  for (const key of keys) {
    const value = metadata[key];
    if (value) {
      selected[key] = value;
    }
  }

  return selected;
}

function exposedServiceNames(requestedDeployment: RequestedDeploymentConfig): string[] {
  return (requestedDeployment.services ?? [])
    .filter((service) => service.network?.exposureMode && service.network.exposureMode !== "none")
    .map((service) => service.name);
}

function serviceGraphMetadata(input: {
  requestedDeployment: RequestedDeploymentConfig;
  dockerfilePath: string;
  composeFile: string;
  targetServiceName?: string;
}): Record<string, string> {
  const services = input.requestedDeployment.services ?? [];
  const exposedServices = exposedServiceNames(input.requestedDeployment);

  return {
    "serviceGraph.enabled": "true",
    "serviceGraph.source": "repository-config",
    "serviceGraph.composeFile": input.composeFile,
    "serviceGraph.dockerfilePath": input.dockerfilePath,
    "serviceGraph.services": JSON.stringify(services),
    "serviceGraph.serviceNames": services.map((service) => service.name).join(","),
    ...(exposedServices.length > 0
      ? { "serviceGraph.exposedServices": exposedServices.join(",") }
      : {}),
    ...(input.targetServiceName ? { targetServiceName: input.targetServiceName } : {}),
  };
}

function requestedReplicaCount(requestedDeployment: RequestedDeploymentConfig): number {
  return requestedDeployment.replicas && requestedDeployment.replicas > 1
    ? requestedDeployment.replicas
    : 1;
}

function replicatedWorkloadMetadata(input: {
  composeFile: string;
  targetServiceName: string;
  replicas: number;
  dockerfilePath?: string;
}): Record<string, string> {
  return {
    composeFile: input.composeFile,
    "compose.file": input.composeFile,
    "compose.projectNameSource": "runtime-instance-name",
    "replicatedWorkload.enabled": "true",
    "replicatedWorkload.composeFile": input.composeFile,
    "replicatedWorkload.serviceName": input.targetServiceName,
    "replicatedWorkload.replicas": String(input.replicas),
    targetServiceName: input.targetServiceName,
    ...(input.dockerfilePath ? { "replicatedWorkload.dockerfilePath": input.dockerfilePath } : {}),
  };
}

function hasEdgeProxyRoute(accessRoutes: AccessRoute[]): boolean {
  return accessRoutes.some((route) => route.proxyKind !== "none");
}

function hasDerivedDefaultAccessRoute(requestedDeployment: RequestedDeploymentConfig): boolean {
  return requestedDeployment.accessContext?.routePurpose === "default-resource-access";
}

function runtimeVerificationStepsFor(input: {
  execution: RuntimeExecutionPlan;
  accessRoutes: AccessRoute[];
}): RuntimeVerificationStep[] {
  if (
    input.execution.kind !== "docker-container" &&
    input.execution.kind !== "docker-compose-stack"
  ) {
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
  if (
    input.execution.kind !== "docker-container" &&
    input.execution.kind !== "docker-compose-stack"
  ) {
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
  runtimeArtifact: RuntimeArtifactSnapshot;
  steps: PlanStepText[];
}): Result<{
  buildStrategy: BuildStrategyKindValue;
  packagingMode: PackagingModeValue;
  execution: RuntimeExecutionPlan;
  runtimeArtifact: RuntimeArtifactSnapshot;
  steps: PlanStepText[];
}> {
  return createAccessRoutes({
    requestedDeployment: input.requestedDeployment,
    ...(input.execution.port ? { fallbackPort: input.execution.port } : {}),
  }).andThen((accessRoutes) => {
    const metadata = executionMetadataFor(input.requestedDeployment);
    const executionWithMetadata =
      Object.keys(metadata).length > 0 ? input.execution.withMetadata(metadata) : input.execution;

    if (
      accessRoutes.length > 0 &&
      input.execution.kind === "docker-compose-stack" &&
      !executionWithMetadata.metadata?.targetServiceName &&
      !hasDerivedDefaultAccessRoute(input.requestedDeployment)
    ) {
      return err(
        domainError.validation(
          "Compose access routing requires a configured target service name",
        ),
      );
    }

    if (
      accessRoutes.length > 0 &&
      input.execution.kind !== "docker-container" &&
      input.execution.kind !== "docker-compose-stack"
    ) {
      if (!hasEdgeProxyRoute(accessRoutes) || hasDerivedDefaultAccessRoute(input.requestedDeployment)) {
        const verificationSteps = runtimeVerificationStepsFor({
          execution: executionWithMetadata,
          accessRoutes: [],
        });
        return ok({
          buildStrategy: input.buildStrategy,
          packagingMode: input.packagingMode,
          execution:
            verificationSteps.length > 0
              ? executionWithMetadata.withVerificationSteps(verificationSteps)
              : executionWithMetadata,
          runtimeArtifact: input.runtimeArtifact,
          steps: runtimePlanStepsFor({
            execution: executionWithMetadata,
            accessRoutes: [],
            steps: input.steps,
          }),
        });
      }

      return err(
        domainError.validation(
          "Access routing is currently supported for Docker container and Compose deployments",
        ),
      );
    }

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
      runtimeArtifact: input.runtimeArtifact,
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
  runtimeArtifact: RuntimeArtifactSnapshot;
  steps: PlanStepText[];
}> {
  const { source, requestedDeployment } = input;
  const requestedMethod =
    requestedDeployment.method === "auto"
      ? autoDeploymentMethodFor(source, requestedDeployment)
      : requestedDeployment.method;

  if (requestedMethod === "docker-compose") {
    const { composeFile, workingDirectory } = composeSourcePaths(source, requestedDeployment);
    const execution = RuntimeExecutionPlan.rehydrate({
      kind: ExecutionStrategyKindValue.rehydrate("docker-compose-stack"),
      workingDirectory: FilePathText.rehydrate(workingDirectory),
      composeFile: FilePathText.rehydrate(composeFile),
      ...runtimeHealthCheckFields(requestedDeployment),
      ...(requestedDeployment.port ? { port: PortNumber.rehydrate(requestedDeployment.port) } : {}),
      metadata: {
        "compose.file": composeFile,
        "compose.workingDirectory": workingDirectory,
        "compose.projectNameSource": "runtime-instance-name",
        composeFile,
        workdir: workingDirectory,
        ...(requestedDeployment.targetServiceName
          ? { targetServiceName: requestedDeployment.targetServiceName }
          : {}),
      },
    });
    return withRequestedAccessRoutes({
      requestedDeployment,
      buildStrategy: BuildStrategyKindValue.rehydrate("compose-deploy"),
      packagingMode: PackagingModeValue.rehydrate("compose-bundle"),
      execution,
      runtimeArtifact: composeRuntimeArtifact({
        composeFile,
        metadata: {
          sourceKind: source.kind,
          applicationShape: "container-native",
          composeFile,
          composeWorkingDirectory: workingDirectory,
          composeProjectNameSource: "runtime-instance-name",
        },
      }),
      steps: [
        PlanStepText.rehydrate("Inspect compose manifest"),
        PlanStepText.rehydrate("Prepare compose bundle"),
        PlanStepText.rehydrate("Run docker compose"),
        PlanStepText.rehydrate("Verify stack"),
      ],
    });
  }

  if (requestedMethod === "prebuilt-image") {
    if (source.kind !== "docker-image") {
      return err(
        domainError.validation("Prebuilt image deployments require a docker-image source", {
          phase: "runtime-artifact-resolution",
          sourceKind: source.kind,
          runtimePlanStrategy: "prebuilt-image",
        }),
      );
    }

    const port = dockerContainerPort(requestedDeployment);
    const image = normalizeDockerImage(source.locator);
    const replicas = requestedReplicaCount(requestedDeployment);
    if (replicas > 1) {
      const targetServiceName = requestedDeployment.targetServiceName ?? "app";
      const metadata = {
        "image.reference": image,
        "artifact.intent": "prebuilt-image",
        ...replicatedWorkloadMetadata({
          composeFile: generatedReplicatedWorkloadComposeFile,
          targetServiceName,
          replicas,
        }),
      };
      const execution = RuntimeExecutionPlan.rehydrate({
        kind: ExecutionStrategyKindValue.rehydrate("docker-compose-stack"),
        composeFile: FilePathText.rehydrate(generatedReplicatedWorkloadComposeFile),
        ...runtimeHealthCheckFields(requestedDeployment),
        port,
        metadata,
      });
      return withRequestedAccessRoutes({
        requestedDeployment,
        buildStrategy: BuildStrategyKindValue.rehydrate("prebuilt-image"),
        packagingMode: PackagingModeValue.rehydrate("compose-bundle"),
        execution,
        runtimeArtifact: composeRuntimeArtifact({
          composeFile: generatedReplicatedWorkloadComposeFile,
          metadata: {
            sourceKind: source.kind,
            image,
            applicationShape: "container-native",
            replicatedWorkload: "true",
            targetServiceName,
            replicas: String(replicas),
          },
        }),
        steps: [
          PlanStepText.rehydrate("Resolve image reference"),
          PlanStepText.rehydrate("Prepare replicated workload compose"),
          PlanStepText.rehydrate("Run docker compose"),
          PlanStepText.rehydrate("Verify stack"),
        ],
      });
    }
    const execution = RuntimeExecutionPlan.rehydrate({
      kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
      image: ImageReference.rehydrate(image),
      ...runtimeHealthCheckFields(requestedDeployment),
      port,
      metadata: {
        "image.reference": image,
        "artifact.intent": "prebuilt-image",
      },
    });
    return withRequestedAccessRoutes({
      requestedDeployment,
      buildStrategy: BuildStrategyKindValue.rehydrate("prebuilt-image"),
      packagingMode: PackagingModeValue.rehydrate("all-in-one-docker"),
      execution,
      runtimeArtifact: imageRuntimeArtifact({
        intent: "prebuilt-image",
        image,
        metadata: {
          sourceKind: source.kind,
          applicationShape: "container-native",
        },
      }),
      steps: [
        PlanStepText.rehydrate("Resolve image reference"),
        PlanStepText.rehydrate("Prepare runtime config"),
        PlanStepText.rehydrate("Run docker container"),
        PlanStepText.rehydrate("Verify container health"),
      ],
    });
  }

  if (requestedMethod === "static") {
    const staticFrameworkPlan = resolveStaticFrameworkPlan({ source, requestedDeployment });
    const publishDirectory = requestedDeployment.publishDirectory ?? staticFrameworkPlan?.publishDirectory;
    const installCommand = requestedDeployment.installCommand ?? staticFrameworkPlan?.installCommand;
    const buildCommand = requestedDeployment.buildCommand ?? staticFrameworkPlan?.buildCommand;
    if (!publishDirectory) {
      return err(
        domainError.validation("Static deployments require publishDirectory", {
          phase: "runtime-artifact-resolution",
          runtimePlanStrategy: "static",
        }),
      );
    }

    const dockerfilePath = "Dockerfile.appaloft-static";
    const port = dockerContainerPort(requestedDeployment);
    const execution = RuntimeExecutionPlan.rehydrate({
      kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
      workingDirectory: FilePathText.rehydrate(source.locator),
      dockerfilePath: FilePathText.rehydrate(dockerfilePath),
      ...(installCommand ? { installCommand: CommandText.rehydrate(installCommand) } : {}),
      ...(buildCommand ? { buildCommand: CommandText.rehydrate(buildCommand) } : {}),
      ...runtimeHealthCheckFields(requestedDeployment),
      port,
      metadata: {
        "artifact.source": "static-site",
        "workspace.applicationShape": "static",
        "static.publishDirectory": publishDirectory,
        "static.server": "adapter-owned",
        "static.serverConfig": "appaloft-nginx",
        ...(staticFrameworkPlan?.metadata
          ? Object.fromEntries(
              Object.entries(staticFrameworkPlan.metadata).map(([key, value]) => [
                `workspace.${key}`,
                value,
              ]),
            )
          : {}),
      },
    });

    return withRequestedAccessRoutes({
      requestedDeployment,
      buildStrategy: BuildStrategyKindValue.rehydrate("static-artifact"),
      packagingMode: PackagingModeValue.rehydrate("all-in-one-docker"),
      execution,
      runtimeArtifact: imageRuntimeArtifact({
        intent: "build-image",
        metadata: {
          sourceKind: source.kind,
          publishDirectory,
          staticServer: "adapter-owned",
          staticServerConfig: "appaloft-nginx",
          dockerfilePath,
          applicationShape: staticFrameworkPlan?.applicationShape ?? "static",
          ...(staticFrameworkPlan
            ? {
                planner: staticFrameworkPlan.plannerKey,
                runtimeKind: "static",
                framework: staticFrameworkPlan.framework,
                baseImage: staticFrameworkPlan.baseImage,
                ...(staticFrameworkPlan.metadata.packageManager
                  ? { packageManager: staticFrameworkPlan.metadata.packageManager }
                  : {}),
                ...(staticFrameworkPlan.metadata.projectName
                  ? { projectName: staticFrameworkPlan.metadata.projectName }
                  : {}),
                ...selectedPlannerMetadata(staticFrameworkPlan.metadata, [
                  "nextOutputMode",
                  "nextRouterEvidence",
                  "packageCommand",
                ]),
              }
            : {}),
        },
      }),
      steps: [
        PlanStepText.rehydrate("Prepare static site"),
        PlanStepText.rehydrate("Package static site"),
        PlanStepText.rehydrate("Run static server container"),
        PlanStepText.rehydrate("Verify container health"),
      ],
    });
  }

  if (requestedMethod === "dockerfile") {
    const port = dockerContainerPort(requestedDeployment);
    const dockerfilePath =
      requestedDeployment.dockerfilePath ??
      source.inspection?.dockerfilePath ??
      source.metadata?.dockerfilePath ??
      "Dockerfile";
    const serviceGraph = requestedDeployment.services ?? [];
    if (serviceGraph.length > 0) {
      const targetServiceName =
        requestedDeployment.targetServiceName ??
        serviceGraph.find((service) => service.network?.exposureMode === "reverse-proxy")?.name ??
        serviceGraph.find((service) => service.network?.exposureMode === "direct-port")?.name;
      const metadata = {
        ...serviceGraphMetadata({
          requestedDeployment,
          dockerfilePath,
          composeFile: generatedServiceGraphComposeFile,
          ...(targetServiceName ? { targetServiceName } : {}),
        }),
      };
      const execution = RuntimeExecutionPlan.rehydrate({
        kind: ExecutionStrategyKindValue.rehydrate("docker-compose-stack"),
        workingDirectory: FilePathText.rehydrate(source.locator),
        composeFile: FilePathText.rehydrate(generatedServiceGraphComposeFile),
        dockerfilePath: FilePathText.rehydrate(dockerfilePath),
        ...runtimeHealthCheckFields(requestedDeployment),
        port,
        metadata,
      });

      return withRequestedAccessRoutes({
        requestedDeployment,
        buildStrategy: BuildStrategyKindValue.rehydrate("dockerfile"),
        packagingMode: PackagingModeValue.rehydrate("compose-bundle"),
        execution,
        runtimeArtifact: composeRuntimeArtifact({
          composeFile: generatedServiceGraphComposeFile,
          metadata: {
            sourceKind: source.kind,
            dockerfilePath,
            applicationShape: "container-native",
            serviceGraphSource: "repository-config",
            serviceNames: serviceGraph.map((service) => service.name).join(","),
            ...(targetServiceName ? { targetServiceName } : {}),
          },
        }),
        steps: [
          PlanStepText.rehydrate("Build docker image"),
          PlanStepText.rehydrate("Generate compose service graph"),
          PlanStepText.rehydrate("Run docker compose"),
          PlanStepText.rehydrate("Verify stack"),
        ],
      });
    }
    const replicas = requestedReplicaCount(requestedDeployment);
    if (replicas > 1) {
      const targetServiceName = requestedDeployment.targetServiceName ?? "app";
      const metadata = replicatedWorkloadMetadata({
        composeFile: generatedReplicatedWorkloadComposeFile,
        targetServiceName,
        replicas,
        dockerfilePath,
      });
      const execution = RuntimeExecutionPlan.rehydrate({
        kind: ExecutionStrategyKindValue.rehydrate("docker-compose-stack"),
        workingDirectory: FilePathText.rehydrate(source.locator),
        composeFile: FilePathText.rehydrate(generatedReplicatedWorkloadComposeFile),
        dockerfilePath: FilePathText.rehydrate(dockerfilePath),
        ...runtimeHealthCheckFields(requestedDeployment),
        port,
        metadata,
      });
      return withRequestedAccessRoutes({
        requestedDeployment,
        buildStrategy: BuildStrategyKindValue.rehydrate("dockerfile"),
        packagingMode: PackagingModeValue.rehydrate("compose-bundle"),
        execution,
        runtimeArtifact: composeRuntimeArtifact({
          composeFile: generatedReplicatedWorkloadComposeFile,
          metadata: {
            sourceKind: source.kind,
            dockerfilePath,
            applicationShape: "container-native",
            replicatedWorkload: "true",
            targetServiceName,
            replicas: String(replicas),
          },
        }),
        steps: [
          PlanStepText.rehydrate("Build docker image"),
          PlanStepText.rehydrate("Prepare replicated workload compose"),
          PlanStepText.rehydrate("Run docker compose"),
          PlanStepText.rehydrate("Verify stack"),
        ],
      });
    }
    const execution = RuntimeExecutionPlan.rehydrate({
      kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
      workingDirectory: FilePathText.rehydrate(source.locator),
      dockerfilePath: FilePathText.rehydrate(dockerfilePath),
      ...runtimeHealthCheckFields(requestedDeployment),
      port,
    });
    return withRequestedAccessRoutes({
      requestedDeployment,
      buildStrategy: BuildStrategyKindValue.rehydrate("dockerfile"),
      packagingMode: PackagingModeValue.rehydrate("all-in-one-docker"),
      execution,
      runtimeArtifact: imageRuntimeArtifact({
        intent: "build-image",
        metadata: {
          sourceKind: source.kind,
          dockerfilePath,
          applicationShape: "container-native",
        },
      }),
      steps: [
        PlanStepText.rehydrate("Build docker image"),
        PlanStepText.rehydrate("Apply environment config"),
        PlanStepText.rehydrate("Run local container"),
        PlanStepText.rehydrate("Verify container health"),
      ],
    });
  }

  if (requestedMethod === "workspace-commands") {
    const workspacePlan = resolveWorkspaceRuntimePlan({
      source,
      requestedDeployment,
    });

    if (workspacePlan.isErr()) {
      return err(workspacePlan.error);
    }

    const plan = workspacePlan.value;
    const serviceGraph = requestedDeployment.services ?? [];
    if (serviceGraph.length > 0) {
      const serviceGraphDockerfilePath = ".appaloft/Dockerfile.appaloft";
      const targetServiceName =
        requestedDeployment.targetServiceName ??
        serviceGraph.find((service) => service.network?.exposureMode === "reverse-proxy")?.name ??
        serviceGraph.find((service) => service.network?.exposureMode === "direct-port")?.name;
      const metadata = {
        "artifact.source": "workspace-commands",
        "artifact.generatedDockerfile": "true",
        ...plan.metadata,
        ...serviceGraphMetadata({
          requestedDeployment,
          dockerfilePath: serviceGraphDockerfilePath,
          composeFile: generatedServiceGraphComposeFile,
          ...(targetServiceName ? { targetServiceName } : {}),
        }),
      };
      const execution = RuntimeExecutionPlan.rehydrate({
        kind: ExecutionStrategyKindValue.rehydrate("docker-compose-stack"),
        workingDirectory: FilePathText.rehydrate(source.locator),
        composeFile: FilePathText.rehydrate(generatedServiceGraphComposeFile),
        dockerfilePath: FilePathText.rehydrate(serviceGraphDockerfilePath),
        startCommand: CommandText.rehydrate(plan.startCommand),
        ...(plan.installCommand
          ? { installCommand: CommandText.rehydrate(plan.installCommand) }
          : {}),
        ...(plan.buildCommand ? { buildCommand: CommandText.rehydrate(plan.buildCommand) } : {}),
        ...(plan.healthCheckPath
          ? { healthCheckPath: HealthCheckPathText.rehydrate(plan.healthCheckPath) }
          : {}),
        ...runtimeHealthCheckFields(requestedDeployment),
        port: dockerContainerPort(requestedDeployment),
        metadata,
      });

      return withRequestedAccessRoutes({
        requestedDeployment,
        buildStrategy: BuildStrategyKindValue.rehydrate("workspace-commands"),
        packagingMode: PackagingModeValue.rehydrate("compose-bundle"),
        execution,
        runtimeArtifact: composeRuntimeArtifact({
          composeFile: generatedServiceGraphComposeFile,
          metadata: {
            sourceKind: source.kind,
            dockerfilePath: serviceGraphDockerfilePath,
            generatedDockerfile: "true",
            generatedComposeFile: "true",
            planner: plan.planner,
            runtimeKind: plan.runtimeKind,
            baseImage: plan.baseImage,
            applicationShape: plan.applicationShape,
            serviceGraphSource: "repository-config",
            serviceNames: serviceGraph.map((service) => service.name).join(","),
            ...(targetServiceName ? { targetServiceName } : {}),
          },
        }),
        steps: [
          PlanStepText.rehydrate("Resolve repository service graph"),
          PlanStepText.rehydrate("Build workspace image"),
          PlanStepText.rehydrate("Generate compose service graph"),
          PlanStepText.rehydrate("Run docker compose"),
          PlanStepText.rehydrate("Verify stack"),
        ],
      });
    }

    const replicas = requestedReplicaCount(requestedDeployment);
    if (replicas > 1) {
      const targetServiceName = requestedDeployment.targetServiceName ?? "app";
      const metadata = {
        "artifact.source": "workspace-commands",
        "artifact.generatedDockerfile": "true",
        ...plan.metadata,
        ...replicatedWorkloadMetadata({
          composeFile: generatedReplicatedWorkloadComposeFile,
          targetServiceName,
          replicas,
          dockerfilePath: plan.dockerfilePath,
        }),
      };
      const execution = RuntimeExecutionPlan.rehydrate({
        kind: ExecutionStrategyKindValue.rehydrate("docker-compose-stack"),
        workingDirectory: FilePathText.rehydrate(source.locator),
        composeFile: FilePathText.rehydrate(generatedReplicatedWorkloadComposeFile),
        dockerfilePath: FilePathText.rehydrate(plan.dockerfilePath),
        startCommand: CommandText.rehydrate(plan.startCommand),
        ...(plan.installCommand
          ? { installCommand: CommandText.rehydrate(plan.installCommand) }
          : {}),
        ...(plan.buildCommand ? { buildCommand: CommandText.rehydrate(plan.buildCommand) } : {}),
        ...(plan.healthCheckPath
          ? { healthCheckPath: HealthCheckPathText.rehydrate(plan.healthCheckPath) }
          : {}),
        ...runtimeHealthCheckFields(requestedDeployment),
        port: dockerContainerPort(requestedDeployment),
        metadata,
      });

      return withRequestedAccessRoutes({
        requestedDeployment,
        buildStrategy: BuildStrategyKindValue.rehydrate("workspace-commands"),
        packagingMode: PackagingModeValue.rehydrate("compose-bundle"),
        execution,
        runtimeArtifact: composeRuntimeArtifact({
          composeFile: generatedReplicatedWorkloadComposeFile,
          metadata: {
            sourceKind: source.kind,
            dockerfilePath: plan.dockerfilePath,
            generatedDockerfile: "true",
            planner: plan.planner,
            runtimeKind: plan.runtimeKind,
            baseImage: plan.baseImage,
            applicationShape: plan.applicationShape,
            replicatedWorkload: "true",
            targetServiceName,
            replicas: String(replicas),
            ...(plan.metadata.packageManager ? { packageManager: plan.metadata.packageManager } : {}),
            ...(plan.metadata.framework ? { framework: plan.metadata.framework } : {}),
            ...(plan.metadata.projectName ? { projectName: plan.metadata.projectName } : {}),
          },
        }),
        steps: [
          PlanStepText.rehydrate("Install workspace dependencies"),
          PlanStepText.rehydrate("Build application bundle"),
          PlanStepText.rehydrate("Build workspace image"),
          PlanStepText.rehydrate("Prepare replicated workload compose"),
          PlanStepText.rehydrate("Run docker compose"),
          PlanStepText.rehydrate("Verify stack"),
        ],
      });
    }

    const execution = RuntimeExecutionPlan.rehydrate({
      kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
      workingDirectory: FilePathText.rehydrate(source.locator),
      dockerfilePath: FilePathText.rehydrate(plan.dockerfilePath),
      startCommand: CommandText.rehydrate(plan.startCommand),
      ...(plan.installCommand ? { installCommand: CommandText.rehydrate(plan.installCommand) } : {}),
      ...(plan.buildCommand ? { buildCommand: CommandText.rehydrate(plan.buildCommand) } : {}),
      ...(plan.healthCheckPath
        ? { healthCheckPath: HealthCheckPathText.rehydrate(plan.healthCheckPath) }
        : {}),
      ...runtimeHealthCheckFields(requestedDeployment),
      port: dockerContainerPort(requestedDeployment),
      metadata: {
        "artifact.source": "workspace-commands",
        "artifact.generatedDockerfile": "true",
        ...plan.metadata,
      },
    });

    return withRequestedAccessRoutes({
      requestedDeployment,
      buildStrategy: BuildStrategyKindValue.rehydrate("workspace-commands"),
      packagingMode: PackagingModeValue.rehydrate("all-in-one-docker"),
      execution,
      runtimeArtifact: imageRuntimeArtifact({
        intent: "build-image",
        metadata: {
          sourceKind: source.kind,
          dockerfilePath: plan.dockerfilePath,
          generatedDockerfile: "true",
          planner: plan.planner,
          runtimeKind: plan.runtimeKind,
          baseImage: plan.baseImage,
          applicationShape: plan.applicationShape,
          ...(plan.metadata.packageManager ? { packageManager: plan.metadata.packageManager } : {}),
          ...(plan.metadata.framework ? { framework: plan.metadata.framework } : {}),
          ...(plan.metadata.projectName ? { projectName: plan.metadata.projectName } : {}),
          ...selectedPlannerMetadata(plan.metadata, ["nextOutputMode", "nextRouterEvidence"]),
        },
      }),
      steps: [
        PlanStepText.rehydrate("Install workspace dependencies"),
        PlanStepText.rehydrate("Build application bundle"),
        PlanStepText.rehydrate("Build workspace image"),
        PlanStepText.rehydrate("Run docker container"),
        PlanStepText.rehydrate("Verify container health"),
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
          [appaloftTraceAttributes.sourceLocator]: input.source.locator,
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
            runtimeArtifact: strategy.runtimeArtifact,
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
  timeline: DeploymentTimelineJournalEntry[];
}

type LogPhase = "detect" | "plan" | "package" | "deploy" | "verify" | "rollback";
type LogLevel = "debug" | "info" | "warn" | "error";

function phaseLog(
  phase: LogPhase,
  message: string,
  level: LogLevel = "info",
): DeploymentTimelineJournalEntry {
  return DeploymentTimelineJournalEntry.rehydrate({
    timestamp: OccurredAt.rehydrate(new Date().toISOString()),
    source: DeploymentTimelineSourceValue.rehydrate("appaloft"),
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
        variable.key === "APPALOFT_SIMULATE_FAILURE" && variable.value === "true",
    )
  );
}

export class InMemoryExecutionBackend implements ExecutionBackend {
  private readonly sessions = new Map<string, ExecutionSession>();

  constructor(
    private readonly progressRecorder: DeploymentProgressRecorder,
    private readonly progressReporter: DeploymentProgressReporter,
  ) {}

  private async report(
    context: ExecutionContext,
    input: {
      deploymentId: string;
      phase: "detect" | "plan" | "package" | "deploy" | "verify" | "rollback";
      message: string;
      status?: "running" | "succeeded" | "failed";
      level?: "debug" | "info" | "warn" | "error";
    },
  ): Promise<void> {
    const event = createDeploymentProgressEvent({
      deploymentId: input.deploymentId,
      phase: input.phase,
      message: input.message,
      ...(input.status ? { status: input.status } : {}),
      ...(input.level ? { level: input.level } : {}),
      step: deploymentProgressSteps[input.phase],
    });
    await this.progressRecorder.record(context, event).catch(() => undefined);
    this.progressReporter.report(context, event);
  }

  private applyResult(
    deployment: Deployment,
    result: ExecutionResult,
  ): Deployment {
    deployment.applyExecutionResult(FinishedAt.rehydrate(new Date().toISOString()), result);
    this.sessions.set(deployment.toState().id.value, {
      deploymentId: deployment.toState().id.value,
      status: result.status,
      timeline: result.timeline,
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
          [appaloftTraceAttributes.sourceLocator]: state.runtimePlan.source.locator,
        },
      },
      async () => {
        const timeline: DeploymentTimelineJournalEntry[] = [
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
        for (const log of timeline) {
          await this.report(context, {
            deploymentId: state.id.value,
            phase: log.phase as "detect" | "plan" | "package" | "deploy" | "verify",
            status: "succeeded",
            message: log.message,
          });
        }

        if (shouldFail(deployment)) {
          const message = context.t(i18nKeys.backend.progress.simulatedVerificationFailure);
          timeline.push(phaseLog("verify", message, "error"));
          await this.report(context, {
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
                timeline,
                retryable: true,
                errorCode: ErrorCodeText.rehydrate("simulated_failure"),
              }),
            ),
          });
        }

        const completedMessage = context.t(i18nKeys.backend.progress.deploymentCompleted);
        timeline.push(phaseLog("verify", completedMessage));
        await this.report(context, {
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
              timeline,
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
  ): Promise<Result<{ timeline: DeploymentTimelineJournalEntry[] }>> {
    const deploymentId = deployment.toState().id.value;
    const timeline = [phaseLog("deploy", "Canceled in-memory execution")];
    this.sessions.set(deploymentId, {
      deploymentId,
      status: "failed",
      timeline,
    });
    await this.report(context, {
      deploymentId,
      phase: "deploy",
      status: "succeeded",
      message: "Canceled in-memory execution",
    });
    return ok({ timeline });
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

        const timeline: DeploymentTimelineJournalEntry[] = [
          phaseLog("rollback", `Loading snapshot ${plan.snapshotId}`),
          phaseLog("rollback", `Executing rollback plan ${plan.id}`),
          phaseLog("rollback", context.t(i18nKeys.backend.progress.rollbackCompleted)),
        ];
        for (const log of timeline) {
          await this.report(context, {
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
              timeline,
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

export class ExecutionBackendRuntimeTargetAdapter implements RuntimeTargetBackend {
  readonly descriptor: RuntimeTargetBackendDescriptor;

  constructor(
    descriptor: RuntimeTargetBackendDescriptor,
    private readonly backend: ExecutionBackend,
  ) {
    this.descriptor = {
      ...descriptor,
      targetKinds: [...descriptor.targetKinds],
      capabilities: [...descriptor.capabilities],
    };
  }

  async execute(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    return await this.backend.execute(context, deployment);
  }

  async cancel(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ timeline: DeploymentTimelineJournalEntry[] }>> {
    return await this.backend.cancel(context, deployment);
  }

  async rollback(
    context: ExecutionContext,
    deployment: Deployment,
    plan: RollbackPlan,
  ): Promise<Result<{ deployment: Deployment }>> {
    return await this.backend.rollback(context, deployment, plan);
  }
}

export class DefaultRuntimeTargetBackendRegistry implements RuntimeTargetBackendRegistry {
  private readonly backends: RuntimeTargetBackend[];

  constructor(backends: RuntimeTargetBackend[]) {
    this.backends = [...backends];
  }

  find(input: RuntimeTargetBackendSelection): Result<RuntimeTargetBackend> {
    const backend = this.backends.find((candidate) => this.matches(candidate, input));
    if (backend) {
      return ok(backend);
    }

    const missingCapability = this.firstMissingCapability(input);
    return err(
      domainError.runtimeTargetUnsupported("Runtime target backend is not registered", {
        phase: "runtime-target-resolution",
        targetKind: input.targetKind,
        providerKey: input.providerKey,
        ...(missingCapability ? { missingCapability } : {}),
      }),
    );
  }

  private matches(
    backend: RuntimeTargetBackend,
    input: RuntimeTargetBackendSelection,
  ): boolean {
    return (
      backend.descriptor.providerKey === input.providerKey &&
      backend.descriptor.targetKinds.includes(input.targetKind) &&
      (input.requiredCapabilities ?? []).every((capability) =>
        backend.descriptor.capabilities.includes(capability),
      )
    );
  }

  private firstMissingCapability(
    input: RuntimeTargetBackendSelection,
  ): RuntimeTargetCapability | undefined {
    const matchingTargetBackend = this.backends.find(
      (backend) =>
        backend.descriptor.providerKey === input.providerKey &&
        backend.descriptor.targetKinds.includes(input.targetKind),
    );
    if (!matchingTargetBackend) {
      return undefined;
    }

    return (input.requiredCapabilities ?? []).find(
      (capability) => !matchingTargetBackend.descriptor.capabilities.includes(capability),
    );
  }
}

const singleServerDockerCapabilities: RuntimeTargetCapability[] = [
  "runtime.apply",
  "runtime.verify",
  "runtime.dependency-secrets",
  "runtime.logs",
  "runtime.health",
  "runtime.cleanup",
  "runtime.capacity",
  "proxy.route",
];

export function createDockerSwarmRuntimeTargetBackendDescriptor(input: {
  capabilities: RuntimeTargetCapability[];
}): RuntimeTargetBackendDescriptor {
  return {
    key: "docker-swarm",
    providerKey: "docker-swarm",
    targetKinds: ["orchestrator-cluster"],
    capabilities: [...input.capabilities],
  };
}

export function createDefaultRuntimeTargetBackendRegistry(input: {
  localBackend: ExecutionBackend;
  sshBackend: ExecutionBackend;
  swarmBackend?: RuntimeTargetBackend;
}): RuntimeTargetBackendRegistry {
  return new DefaultRuntimeTargetBackendRegistry([
    new ExecutionBackendRuntimeTargetAdapter(
      {
        key: "single-server-local-shell",
        providerKey: "local-shell",
        targetKinds: ["single-server"],
        capabilities: singleServerDockerCapabilities,
      },
      input.localBackend,
    ),
    new ExecutionBackendRuntimeTargetAdapter(
      {
        key: "single-server-generic-ssh",
        providerKey: "generic-ssh",
        targetKinds: ["single-server"],
        capabilities: singleServerDockerCapabilities,
      },
      input.sshBackend,
    ),
    ...(input.swarmBackend ? [input.swarmBackend] : []),
  ]);
}

export class RoutingExecutionBackend implements ExecutionBackend {
  constructor(
    private readonly registry: RuntimeTargetBackendRegistry,
    private readonly fallbackBackend: ExecutionBackend,
  ) {}

  private backendFor(
    deployment: Deployment,
    requiredCapabilities: RuntimeTargetCapability[],
  ): ExecutionBackend {
    const target = deployment.toState().runtimePlan.target;
    const backend = this.registry.find({
      targetKind: target.kind,
      providerKey: target.providerKey,
      requiredCapabilities,
    });

    if (backend.isOk()) {
      return backend.value;
    }

    return this.fallbackBackend;
  }

  async execute(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    return await this.backendFor(deployment, ["runtime.apply", "runtime.verify"]).execute(
      context,
      deployment,
    );
  }

  async cancel(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ timeline: DeploymentTimelineJournalEntry[] }>> {
    return await this.backendFor(deployment, ["runtime.cleanup"]).cancel(context, deployment);
  }

  async rollback(
    context: ExecutionContext,
    deployment: Deployment,
    plan: RollbackPlan,
  ): Promise<Result<{ deployment: Deployment }>> {
    return await this.backendFor(deployment, ["runtime.cleanup"]).rollback(
      context,
      deployment,
      plan,
    );
  }
}

export { LocalExecutionBackend };
export { RuntimeServerEdgeProxyBootstrapper } from "./server-edge-proxy-bootstrapper";
export { RuntimeServerRuntimePreparer } from "./server-runtime-preparer";
