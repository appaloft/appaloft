import {
  type Deployment,
  type Destination,
  domainError,
  type Environment,
  err,
  LatestDeploymentSpec,
  LatestRuntimeOwningDeploymentSpec,
  ok,
  type Project,
  type Resource,
  type ResourceHealthCheckPolicyState,
  ResourceSourceBinding,
  type Result,
  type Server,
  SourceDescriptor,
  safeTry,
  UpsertDeploymentSpec,
} from "@appaloft/core";
import { i18nKeys } from "@appaloft/i18n";
import { inject, injectable } from "tsyringe";
import { deploymentProgressSteps, reportDeploymentProgress } from "../../deployment-progress";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { createCoordinationOwner, mutationCoordinationPolicies } from "../../mutation-coordination";
import {
  type AppLogger,
  type DeploymentProgressReporter,
  type DeploymentRepository,
  type DomainRouteBindingCandidate,
  type DomainRouteBindingReader,
  type EventBus,
  type ExecutionBackend,
  type MutationCoordinator,
  type RequestedDeploymentConfig,
  type RequestedDeploymentHealthCheck,
  type RuntimePlanResolver,
  type ServerAppliedRouteDesiredStateDomain,
  type ServerAppliedRouteDesiredStateReader,
  type ServerAppliedRouteDesiredStateRecord,
  ServerAppliedRouteStateByTargetSpec,
  type SourceDetector,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type CreateDeploymentCommandInput } from "./create-deployment.command";
import { type DeploymentFactory } from "./deployment.factory";
import { type DeploymentContextBootstrapService } from "./deployment-config-bootstrap.service";
import { type DeploymentContextResolver } from "./deployment-context.resolver";
import { type DeploymentLifecycleService } from "./deployment-lifecycle.service";
import { deploymentResourceRuntimeScope } from "./deployment-mutation-scopes";
import { type DeploymentSnapshotFactory } from "./deployment-snapshot.factory";
import { type RuntimePlanResolutionInputBuilder } from "./runtime-plan-resolution-input.builder";

function createResourceSourceDescriptor(
  resource: Resource,
): Result<{ source: SourceDescriptor; reasoning: string[] }> {
  const resourceState = resource.toState();
  const sourceBinding = resourceState.sourceBinding;

  if (!sourceBinding) {
    return err(
      domainError.validation("Resource source binding is required for deployment admission", {
        phase: "resource-source-resolution",
        resourceId: resourceState.id.value,
      }),
    );
  }

  const normalizedBinding = ResourceSourceBinding.create(sourceBinding);
  if (normalizedBinding.isErr()) {
    return err(normalizedBinding.error);
  }
  const normalizedSourceBinding = normalizedBinding.value.toState();
  const metadata = ResourceSourceBinding.metadataFromState(normalizedSourceBinding);

  const source = SourceDescriptor.rehydrate({
    kind: normalizedSourceBinding.kind,
    locator: normalizedSourceBinding.locator,
    displayName: normalizedSourceBinding.displayName,
    ...(metadata ? { metadata } : {}),
  });

  return ok({
    source,
    reasoning: [`Resource source binding kind: ${normalizedSourceBinding.kind.value}`],
  });
}

function shouldEnrichSourceFromDetector(resource: Resource): boolean {
  const sourceKind = resource.toState().sourceBinding?.kind.value;
  return sourceKind === "local-folder" || sourceKind === "local-git" || sourceKind === "compose";
}

function resourceRequiresInternalPort(resource: Resource): boolean {
  const resourceState = resource.toState();
  return (
    resourceState.kind.value === "application" ||
    resourceState.kind.value === "service" ||
    resourceState.kind.value === "static-site" ||
    resourceState.kind.value === "compose-stack" ||
    resourceState.services.some(
      (service) => service.kind.value === "web" || service.kind.value === "api",
    )
  );
}

function requestedHealthCheck(
  policy: ResourceHealthCheckPolicyState,
): RequestedDeploymentHealthCheck {
  return {
    enabled: policy.enabled,
    type: policy.type.value,
    intervalSeconds: policy.intervalSeconds.value,
    timeoutSeconds: policy.timeoutSeconds.value,
    retries: policy.retries.value,
    startPeriodSeconds: policy.startPeriodSeconds.value,
    ...(policy.http
      ? {
          http: {
            method: policy.http.method.value,
            scheme: policy.http.scheme.value,
            host: policy.http.host.value,
            ...(policy.http.port ? { port: policy.http.port.value } : {}),
            path: policy.http.path.value,
            expectedStatusCode: policy.http.expectedStatusCode.value,
            ...(policy.http.expectedResponseText
              ? { expectedResponseText: policy.http.expectedResponseText.value }
              : {}),
          },
        }
      : {}),
    ...(policy.command ? { command: { command: policy.command.command.value } } : {}),
  };
}

function requestedDeploymentFromResource(resource: Resource): Result<RequestedDeploymentConfig> {
  const resourceState = resource.toState();
  const runtimeProfile = resourceState.runtimeProfile;
  const networkProfile = resourceState.networkProfile;
  const accessProfile = resourceState.accessProfile;
  const internalPort = networkProfile?.internalPort.value;
  const method = runtimeProfile?.strategy.value ?? "auto";

  if (resourceRequiresInternalPort(resource) && !internalPort) {
    return err(
      domainError.validation("Resource network profile internalPort is required for deployment", {
        phase: "resource-network-resolution",
        resourceId: resourceState.id.value,
        resourceKind: resourceState.kind.value,
      }),
    );
  }

  if (method === "static" && !runtimeProfile?.publishDirectory) {
    return err(
      domainError.validation("Static runtime profiles require publishDirectory for deployment", {
        phase: "runtime-plan-resolution",
        resourceId: resourceState.id.value,
        runtimePlanStrategy: "static",
      }),
    );
  }

  return ok({
    method,
    ...(runtimeProfile?.installCommand
      ? { installCommand: runtimeProfile.installCommand.value }
      : {}),
    ...(runtimeProfile?.buildCommand ? { buildCommand: runtimeProfile.buildCommand.value } : {}),
    ...(runtimeProfile?.startCommand ? { startCommand: runtimeProfile.startCommand.value } : {}),
    ...(runtimeProfile?.runtimeName
      ? { runtimeMetadata: { "resource.runtimeName": runtimeProfile.runtimeName.value } }
      : {}),
    ...(runtimeProfile?.publishDirectory
      ? { publishDirectory: runtimeProfile.publishDirectory.value }
      : {}),
    ...(runtimeProfile?.dockerfilePath
      ? { dockerfilePath: runtimeProfile.dockerfilePath.value }
      : {}),
    ...(runtimeProfile?.dockerComposeFilePath
      ? { dockerComposeFilePath: runtimeProfile.dockerComposeFilePath.value }
      : {}),
    ...(runtimeProfile?.buildTarget ? { buildTarget: runtimeProfile.buildTarget.value } : {}),
    ...(internalPort ? { port: internalPort } : {}),
    ...(networkProfile
      ? {
          exposureMode: networkProfile.exposureMode.value,
          upstreamProtocol: networkProfile.upstreamProtocol.value,
          ...(accessProfile?.generatedAccessMode.isDisabled()
            ? {}
            : {
                accessContext: {
                  projectId: resourceState.projectId.value,
                  environmentId: resourceState.environmentId.value,
                  resourceId: resourceState.id.value,
                  resourceSlug: resourceState.slug.value,
                  ...(resourceState.destinationId
                    ? { destinationId: resourceState.destinationId.value }
                    : {}),
                  exposureMode: networkProfile.exposureMode.value,
                  upstreamProtocol: networkProfile.upstreamProtocol.value,
                  routePurpose: "default-resource-access",
                  ...(accessProfile?.pathPrefix
                    ? { pathPrefix: accessProfile.pathPrefix.value }
                    : {}),
                },
              }),
        }
      : {}),
    ...(runtimeProfile?.healthCheckPath
      ? { healthCheckPath: runtimeProfile.healthCheckPath.value }
      : {}),
    ...(runtimeProfile?.healthCheck
      ? { healthCheck: requestedHealthCheck(runtimeProfile.healthCheck) }
      : {}),
  });
}

function compactMetadata(input: Record<string, string | undefined>): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const normalized = value?.trim();
    if (normalized) {
      metadata[key] = normalized;
    }
  }

  return metadata;
}

function previewMetadataForEnvironment(input: {
  environmentName: string;
  environmentKind: string;
}): Record<string, string> {
  if (input.environmentKind !== "preview") {
    return {};
  }

  const previewId = input.environmentName.startsWith("preview-")
    ? input.environmentName.slice("preview-".length)
    : input.environmentName;
  const pullRequestMatch = /^pr-(\d+)$/.exec(previewId);
  const previewNumber = pullRequestMatch?.[1];

  return compactMetadata({
    "preview.id": previewId,
    ...(previewNumber
      ? {
          "preview.number": previewNumber,
          "preview.mode": "pull-request",
        }
      : {}),
  });
}

function requestedDeploymentWithRuntimeContextMetadata(
  requestedDeployment: RequestedDeploymentConfig,
  input: {
    project: Project;
    environment: Environment;
    resource: Resource;
    server: Server;
    destination: Destination;
  },
): RequestedDeploymentConfig {
  const projectState = input.project.toState();
  const environmentState = input.environment.toState();
  const resourceState = input.resource.toState();
  const serverState = input.server.toState();
  const destinationState = input.destination.toState();
  const environmentName = environmentState.name.value;
  const environmentKind = environmentState.kind.value;

  return {
    ...requestedDeployment,
    runtimeMetadata: {
      ...(requestedDeployment.runtimeMetadata ?? {}),
      ...compactMetadata({
        "context.projectName": projectState.name.value,
        "context.projectSlug": projectState.slug.value,
        "context.environmentName": environmentName,
        "context.environmentKind": environmentKind,
        "context.resourceName": resourceState.name.value,
        "context.resourceSlug": resourceState.slug.value,
        "context.resourceKind": resourceState.kind.value,
        "context.destinationName": destinationState.name.value,
        "context.destinationKind": destinationState.kind.value,
        "context.serverName": serverState.name.value,
        "context.serverProviderKey": serverState.providerKey.value,
        "context.serverTargetKind": serverState.targetKind.value,
      }),
      ...previewMetadataForEnvironment({ environmentName, environmentKind }),
    },
  };
}

function isDeploymentWriteFenceError(error: { details?: Record<string, unknown> }): boolean {
  return error.details?.aggregateRoot === "deployment" && error.details?.reason === "stale_write";
}

function isDeploymentInsertConflict(error: { details?: Record<string, unknown> }): boolean {
  return (
    error.details?.aggregateRoot === "deployment" &&
    error.details?.constraint === "deployments_active_resource_unique"
  );
}

function redeployGuardErrorFromInsertConflict(input: {
  deploymentId?: string;
  resourceId: string;
  status?: string;
}): ReturnType<typeof domainError.deploymentNotRedeployable> {
  return domainError.deploymentNotRedeployable(
    "Latest deployment for this resource must be succeeded or failed before redeploying",
    {
      commandName: "deployments.create",
      phase: "redeploy-guard",
      resourceId: input.resourceId,
      ...(input.deploymentId ? { deploymentId: input.deploymentId } : {}),
      ...(input.status ? { status: input.status } : {}),
      causeCode: "concurrent_active_deployment",
    },
  );
}

function isExecutionSupersededError(error: { details?: Record<string, unknown> }): boolean {
  return error.details?.causeCode === "deployment_execution_superseded";
}

function requestedDeploymentWithDurableDomainBindings(
  requestedDeployment: RequestedDeploymentConfig,
  bindings: DomainRouteBindingCandidate[],
): RequestedDeploymentConfig {
  if (
    requestedDeployment.accessContext?.exposureMode !== "reverse-proxy" ||
    (requestedDeployment.domains?.length ?? 0) > 0 ||
    (requestedDeployment.accessRoutes?.length ?? 0) > 0
  ) {
    return requestedDeployment;
  }

  const servedBindings = bindings
    .filter((binding) => !binding.redirectTo && binding.proxyKind !== "none")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const readyPrimaryBinding = servedBindings.find((binding) => binding.status === "ready");
  const primaryBinding =
    readyPrimaryBinding ??
    servedBindings.find(
      (binding) =>
        binding.status === "bound" ||
        binding.status === "certificate_pending" ||
        binding.status === "not_ready",
    );

  if (!primaryBinding) {
    return requestedDeployment;
  }

  const allowedStatuses = new Set<DomainRouteBindingCandidate["status"]>(
    primaryBinding.status === "ready" ? ["ready"] : ["bound", "certificate_pending", "not_ready"],
  );
  const routeGroups = domainBindingRouteGroups(
    bindings.filter((binding) => allowedStatuses.has(binding.status)),
    primaryBinding.proxyKind,
  );
  const primaryRouteGroup = routeGroups.find(
    (group) =>
      !group.redirectTo &&
      group.pathPrefix === primaryBinding.pathPrefix &&
      group.tlsMode === primaryBinding.tlsMode,
  );

  if (!primaryRouteGroup) {
    return requestedDeployment;
  }

  return {
    ...requestedDeployment,
    proxyKind: primaryBinding.proxyKind,
    domains: primaryRouteGroup.domains,
    pathPrefix: primaryBinding.pathPrefix,
    tlsMode: primaryBinding.tlsMode,
    accessRoutes: routeGroups.map((group) => ({
      proxyKind: primaryBinding.proxyKind,
      domains: group.domains,
      pathPrefix: group.pathPrefix,
      tlsMode: group.tlsMode,
      ...(group.redirectTo
        ? {
            routeBehavior: "redirect" as const,
            redirectTo: group.redirectTo,
            redirectStatus: group.redirectStatus ?? 308,
          }
        : {}),
    })),
    accessRouteMetadata: {
      ...(requestedDeployment.accessRouteMetadata ?? {}),
      "access.routeSource": "durable-domain-binding",
      "access.domainBindingId": primaryBinding.id,
      "access.domainBindingStatus": primaryBinding.status,
      "access.hostname": primaryBinding.domainName,
      "access.scheme": primaryBinding.tlsMode === "auto" ? "https" : "http",
      "access.routeGroupCount": String(routeGroups.length),
      ...(routeGroups.some((group) => group.redirectTo)
        ? {
            "access.redirectRouteCount": String(
              routeGroups.filter((group) => group.redirectTo).length,
            ),
          }
        : {}),
    },
  };
}

interface DomainBindingRouteGroup {
  domains: string[];
  pathPrefix: string;
  tlsMode: DomainRouteBindingCandidate["tlsMode"];
  redirectTo?: string;
  redirectStatus?: 301 | 302 | 307 | 308;
}

function domainBindingRouteGroups(
  bindings: DomainRouteBindingCandidate[],
  proxyKind: DomainRouteBindingCandidate["proxyKind"],
): DomainBindingRouteGroup[] {
  const groups: DomainBindingRouteGroup[] = [];
  const groupIndexes = new Map<string, number>();

  for (const binding of bindings) {
    if (binding.proxyKind !== proxyKind) {
      continue;
    }

    if (binding.redirectTo) {
      groups.push({
        domains: [binding.domainName],
        pathPrefix: binding.pathPrefix,
        tlsMode: binding.tlsMode,
        redirectTo: binding.redirectTo,
        redirectStatus: binding.redirectStatus ?? 308,
      });
      continue;
    }

    const groupKey = `${binding.pathPrefix}\u0000${binding.tlsMode}`;
    const existingIndex = groupIndexes.get(groupKey);
    if (existingIndex === undefined) {
      groupIndexes.set(groupKey, groups.length);
      groups.push({
        domains: [binding.domainName],
        pathPrefix: binding.pathPrefix,
        tlsMode: binding.tlsMode,
      });
      continue;
    }

    const group = groups[existingIndex];
    if (group) {
      group.domains.push(binding.domainName);
    }
  }

  return groups;
}

function proxyKindFromServer(
  server: Parameters<RuntimePlanResolutionInputBuilder["build"]>[0]["server"],
): NonNullable<RequestedDeploymentConfig["proxyKind"]> | undefined {
  const edgeProxy = server.toState().edgeProxy;

  if (!edgeProxy || edgeProxy.kind.value === "none" || edgeProxy.status.value === "disabled") {
    return undefined;
  }

  return edgeProxy.kind.value;
}

interface ServerAppliedRouteGroup {
  domains: string[];
  pathPrefix: string;
  tlsMode: ServerAppliedRouteDesiredStateDomain["tlsMode"];
  redirectTo?: string;
  redirectStatus?: 301 | 302 | 307 | 308;
}

function serverAppliedRouteGroups(
  domains: ServerAppliedRouteDesiredStateDomain[],
): ServerAppliedRouteGroup[] {
  const groups: ServerAppliedRouteGroup[] = [];
  const groupIndexes = new Map<string, number>();

  for (const domain of domains) {
    if (domain.redirectTo) {
      groups.push({
        domains: [domain.host],
        pathPrefix: domain.pathPrefix,
        tlsMode: domain.tlsMode,
        redirectTo: domain.redirectTo,
        redirectStatus: domain.redirectStatus ?? 308,
      });
      continue;
    }

    const groupKey = `${domain.pathPrefix}\u0000${domain.tlsMode}`;
    const existingIndex = groupIndexes.get(groupKey);

    if (existingIndex === undefined) {
      groupIndexes.set(groupKey, groups.length);
      groups.push({
        domains: [domain.host],
        pathPrefix: domain.pathPrefix,
        tlsMode: domain.tlsMode,
      });
      continue;
    }

    const group = groups[existingIndex];
    if (group) {
      group.domains.push(domain.host);
    }
  }

  return groups;
}

function requestedDeploymentWithServerAppliedRoutes(input: {
  requestedDeployment: RequestedDeploymentConfig;
  desiredState: ServerAppliedRouteDesiredStateRecord | null;
  proxyKind: NonNullable<RequestedDeploymentConfig["proxyKind"]> | undefined;
}): Result<RequestedDeploymentConfig> {
  if (
    input.requestedDeployment.accessContext?.exposureMode !== "reverse-proxy" ||
    (input.requestedDeployment.domains?.length ?? 0) > 0 ||
    (input.requestedDeployment.accessRoutes?.length ?? 0) > 0 ||
    !input.desiredState ||
    input.desiredState.domains.length === 0 ||
    !input.proxyKind
  ) {
    return ok(input.requestedDeployment);
  }

  const primaryRoute = input.desiredState.domains[0];
  const primaryServedRoute = input.desiredState.domains.find((domain) => !domain.redirectTo);
  if (!primaryRoute) {
    return ok(input.requestedDeployment);
  }

  const proxyKind = input.proxyKind;
  const routeGroups = serverAppliedRouteGroups(input.desiredState.domains);
  const primaryRouteGroup = routeGroups.find((group) => !group.redirectTo) ?? routeGroups[0];

  if (!primaryRouteGroup) {
    return ok(input.requestedDeployment);
  }

  const primaryHostname = primaryServedRoute?.host ?? primaryRoute.host;
  const primaryScheme =
    (primaryServedRoute?.tlsMode ?? primaryRoute.tlsMode) === "auto" ? "https" : "http";
  const redirectRouteCount = routeGroups.filter((group) => group.redirectTo).length;

  return ok({
    ...input.requestedDeployment,
    proxyKind,
    domains: primaryRouteGroup.domains,
    pathPrefix: primaryRouteGroup.pathPrefix,
    tlsMode: primaryRouteGroup.tlsMode,
    accessRoutes: routeGroups.map((group) => ({
      proxyKind,
      domains: group.domains,
      pathPrefix: group.pathPrefix,
      tlsMode: group.tlsMode,
      ...(group.redirectTo
        ? {
            routeBehavior: "redirect" as const,
            redirectTo: group.redirectTo,
            redirectStatus: group.redirectStatus ?? 308,
          }
        : {}),
    })),
    accessRouteMetadata: {
      ...(input.requestedDeployment.accessRouteMetadata ?? {}),
      "access.routeSource": "server-applied-config-domain",
      "access.serverAppliedRouteSetId": input.desiredState.routeSetId,
      "access.hostname": primaryHostname,
      "access.scheme": primaryScheme,
      "access.routeCount": String(input.desiredState.domains.length),
      "access.routeGroupCount": String(routeGroups.length),
      ...(redirectRouteCount > 0
        ? { "access.redirectRouteCount": String(redirectRouteCount) }
        : {}),
      ...(input.desiredState.sourceFingerprint
        ? { "access.sourceFingerprint": input.desiredState.sourceFingerprint }
        : {}),
    },
  });
}

@injectable()
export class CreateDeploymentUseCase {
  constructor(
    @inject(tokens.deploymentRepository)
    private readonly deploymentRepository: DeploymentRepository,
    @inject(tokens.deploymentContextResolver)
    private readonly deploymentContextResolver: DeploymentContextResolver,
    @inject(tokens.deploymentContextBootstrapService)
    private readonly deploymentContextBootstrapService: DeploymentContextBootstrapService,
    @inject(tokens.sourceDetector)
    private readonly sourceDetector: SourceDetector,
    @inject(tokens.runtimePlanResolver)
    private readonly runtimePlanResolver: RuntimePlanResolver,
    @inject(tokens.executionBackend)
    private readonly executionBackend: ExecutionBackend,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.deploymentProgressReporter)
    private readonly deploymentProgressReporter: DeploymentProgressReporter,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
    @inject(tokens.deploymentSnapshotFactory)
    private readonly deploymentSnapshotFactory: DeploymentSnapshotFactory,
    @inject(tokens.runtimePlanResolutionInputBuilder)
    private readonly runtimePlanResolutionInputBuilder: RuntimePlanResolutionInputBuilder,
    @inject(tokens.deploymentFactory)
    private readonly deploymentFactory: DeploymentFactory,
    @inject(tokens.deploymentLifecycleService)
    private readonly deploymentLifecycleService: DeploymentLifecycleService,
    @inject(tokens.mutationCoordinator)
    private readonly mutationCoordinator: MutationCoordinator,
    @inject(tokens.domainRouteBindingReader)
    private readonly domainRouteBindingReader?: DomainRouteBindingReader,
    @inject(tokens.serverAppliedRouteStateRepository)
    private readonly serverAppliedRouteStateRepository?: ServerAppliedRouteDesiredStateReader,
  ) {}

  private async persistDeployment(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<"persisted" | "fenced">> {
    const result = await this.deploymentRepository.updateOne(
      toRepositoryContext(context),
      deployment,
      UpsertDeploymentSpec.fromDeployment(deployment),
    );

    if (result.isErr()) {
      if (isDeploymentWriteFenceError(result.error)) {
        return ok("fenced");
      }

      return err(result.error);
    }

    return ok("persisted");
  }

  private async supersedeActiveDeployment(input: {
    context: ExecutionContext;
    activeDeployment: Deployment;
    supersedingDeployment: Deployment;
  }): Promise<Result<void>> {
    const { activeDeployment, context, supersedingDeployment } = input;
    const activeState = activeDeployment.toState();
    const supersedingDeploymentId = supersedingDeployment.toState().id;

    if (activeState.status.value === "running") {
      const requestResult = this.deploymentLifecycleService.requestCancellationForSupersede(
        activeDeployment,
        supersedingDeploymentId,
      );
      if (requestResult.isErr()) {
        return err(requestResult.error);
      }

      const fencePersistResult = await this.persistDeployment(context, activeDeployment);
      if (fencePersistResult.isErr()) {
        return err(fencePersistResult.error);
      }
      if (fencePersistResult.value === "fenced") {
        return err(
          domainError.deploymentNotRedeployable(
            "Another deployment replaced the active attempt before this request could supersede it",
            {
              commandName: "deployments.create",
              phase: "redeploy-guard",
              deploymentId: activeState.id.value,
              resourceId: activeState.resourceId.value,
              status: activeState.status.value,
              causeCode: "supersede_race_lost",
            },
          ),
        );
      }

      const cancelResult = await this.executionBackend.cancel(context, activeDeployment);
      if (cancelResult.isErr()) {
        return err(
          domainError.conflict("Previous deployment could not be canceled before superseding it", {
            commandName: "deployments.create",
            phase: "supersede-previous-deployment",
            deploymentId: activeState.id.value,
            resourceId: activeState.resourceId.value,
            status: activeState.status.value,
            supersededByDeploymentId: supersedingDeploymentId.value,
            causeCode: cancelResult.error.code,
          }),
        );
      }

      const cancelTransitionResult = this.deploymentLifecycleService.cancelForSupersede(
        activeDeployment,
        supersedingDeploymentId,
        cancelResult.value.logs,
      );
      if (cancelTransitionResult.isErr()) {
        return err(cancelTransitionResult.error);
      }
    } else {
      const cancelTransitionResult = this.deploymentLifecycleService.cancelForSupersede(
        activeDeployment,
        supersedingDeploymentId,
      );
      if (cancelTransitionResult.isErr()) {
        return err(cancelTransitionResult.error);
      }
    }

    const persistResult = await this.persistDeployment(context, activeDeployment);
    if (persistResult.isErr()) {
      return err(persistResult.error);
    }
    if (persistResult.value === "fenced") {
      return err(
        domainError.deploymentNotRedeployable(
          "Another deployment replaced the active attempt before this request could supersede it",
          {
            commandName: "deployments.create",
            phase: "redeploy-guard",
            deploymentId: activeState.id.value,
            resourceId: activeState.resourceId.value,
            status: activeState.status.value,
            causeCode: "supersede_race_lost",
          },
        ),
      );
    }

    await publishDomainEventsAndReturn(
      context,
      this.eventBus,
      this.logger,
      activeDeployment,
      undefined,
    );
    return ok(undefined);
  }

  async execute(
    context: ExecutionContext,
    input: CreateDeploymentCommandInput,
  ): Promise<Result<{ id: string }>> {
    const {
      deploymentFactory,
      deploymentContextBootstrapService,
      deploymentContextResolver,
      deploymentLifecycleService,
      deploymentRepository,
      domainRouteBindingReader,
      deploymentSnapshotFactory,
      eventBus,
      executionBackend,
      logger,
      mutationCoordinator,
      deploymentProgressReporter,
      runtimePlanResolutionInputBuilder,
      runtimePlanResolver,
      serverAppliedRouteStateRepository,
      sourceDetector,
    } = this;
    const persistDeployment = this.persistDeployment.bind(this);
    const supersedeActiveDeployment = this.supersedeActiveDeployment.bind(this);
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      reportDeploymentProgress(deploymentProgressReporter, context, {
        phase: "detect",
        status: "running",
        step: deploymentProgressSteps.detect,
        message: context.t(i18nKeys.backend.deployment.resolveContextAndDetect),
      });
      const effectiveInputResult = await deploymentContextBootstrapService.bootstrap(
        context,
        input,
      );
      const effectiveInput = yield* effectiveInputResult;

      const resolvedContextResult = await deploymentContextResolver.resolve(
        context,
        effectiveInput,
      );
      const { project, server, destination, environment, resource } = yield* resolvedContextResult;
      yield* project.ensureCanAcceptMutation("deployments.create");

      const resourceSourceResult = createResourceSourceDescriptor(resource);
      const resourceSource = yield* resourceSourceResult;
      let detected = resourceSource;
      if (shouldEnrichSourceFromDetector(resource)) {
        const detectedResult = await sourceDetector.detect(context, resourceSource.source.locator);
        detected = yield* detectedResult;
      }
      reportDeploymentProgress(deploymentProgressReporter, context, {
        phase: "detect",
        status: "succeeded",
        step: deploymentProgressSteps.detect,
        message: context.t(i18nKeys.backend.deployment.detectedSource, {
          kind: detected.source.kind,
          displayName: detected.source.displayName,
        }),
      });

      reportDeploymentProgress(deploymentProgressReporter, context, {
        phase: "plan",
        status: "running",
        step: deploymentProgressSteps.plan,
        message: context.t(i18nKeys.backend.deployment.createSnapshotAndPlan),
      });
      const snapshotResult = deploymentSnapshotFactory.create(environment, resource);
      const snapshot = yield* snapshotResult;
      const requestedDeploymentBase = yield* requestedDeploymentFromResource(resource);
      const targetContext = {
        projectId: project.toState().id.value,
        environmentId: environment.toState().id.value,
        resourceId: resource.toState().id.value,
        serverId: server.toState().id.value,
        destinationId: destination.toState().id.value,
      };
      let serverAppliedRouteDesiredState = serverAppliedRouteStateRepository
        ? yield* await serverAppliedRouteStateRepository.findOne(
            ServerAppliedRouteStateByTargetSpec.create(targetContext),
          )
        : null;
      if (
        !serverAppliedRouteDesiredState &&
        serverAppliedRouteStateRepository &&
        targetContext.destinationId
      ) {
        serverAppliedRouteDesiredState = yield* await serverAppliedRouteStateRepository.findOne(
          ServerAppliedRouteStateByTargetSpec.create({
            projectId: targetContext.projectId,
            environmentId: targetContext.environmentId,
            resourceId: targetContext.resourceId,
            serverId: targetContext.serverId,
          }),
        );
      }
      const routeBindings = domainRouteBindingReader
        ? await domainRouteBindingReader.listDeployableBindings(repositoryContext, {
            projectId: targetContext.projectId,
            environmentId: targetContext.environmentId,
            resourceId: targetContext.resourceId,
            serverId: targetContext.serverId,
            destinationId: targetContext.destinationId,
          })
        : [];
      const requestedDeploymentWithDurableRoute = requestedDeploymentWithDurableDomainBindings(
        requestedDeploymentBase,
        routeBindings,
      );
      const requestedDeployment = yield* requestedDeploymentWithServerAppliedRoutes({
        requestedDeployment: requestedDeploymentWithDurableRoute,
        desiredState: serverAppliedRouteDesiredState,
        proxyKind: proxyKindFromServer(server),
      });
      const requestedDeploymentWithRuntimeMetadata = requestedDeploymentWithRuntimeContextMetadata(
        requestedDeployment,
        {
          project,
          environment,
          resource,
          server,
          destination,
        },
      );
      const runtimePlanInputResult = runtimePlanResolutionInputBuilder.build({
        source: detected.source,
        server,
        environmentSnapshot: snapshot,
        detectedReasoning: detected.reasoning,
        requestedDeployment: requestedDeploymentWithRuntimeMetadata,
      });
      const runtimePlanInput = yield* runtimePlanInputResult;
      const runtimePlanResult = await runtimePlanResolver.resolve(context, runtimePlanInput);
      const runtimePlan = yield* runtimePlanResult;
      const admittedDeploymentResult = await mutationCoordinator.runExclusive({
        context,
        policy: mutationCoordinationPolicies.createDeployment,
        scope: deploymentResourceRuntimeScope({ resource, server, destination }),
        owner: createCoordinationOwner(context, "deployments.create"),
        work: async () =>
          safeTry(async function* () {
            const latestDeployment = await deploymentRepository.findOne(
              repositoryContext,
              LatestDeploymentSpec.forResource(resource.toState().id),
            );
            const activeDeployment =
              latestDeployment && !latestDeployment.canStartNewDeployment()
                ? latestDeployment
                : null;
            const latestRuntimeOwningDeployment = await deploymentRepository.findOne(
              repositoryContext,
              LatestRuntimeOwningDeploymentSpec.forResource(resource.toState().id),
            );

            const deploymentResult = deploymentFactory.create({
              project,
              server,
              destination,
              environment,
              resource,
              runtimePlan,
              environmentSnapshot: snapshot,
              ...(latestRuntimeOwningDeployment
                ? { supersedesDeploymentId: latestRuntimeOwningDeployment.toState().id }
                : {}),
            });
            const deployment = yield* deploymentResult;

            if (activeDeployment) {
              const supersedeResult = await supersedeActiveDeployment({
                context,
                activeDeployment,
                supersedingDeployment: deployment,
              });
              yield* supersedeResult;
            }

            const prepareResult = deploymentLifecycleService.prepareForExecution(deployment);
            yield* prepareResult;

            const insertResult = await deploymentRepository.insertOne(
              repositoryContext,
              deployment,
              UpsertDeploymentSpec.fromDeployment(deployment),
            );
            if (insertResult.isErr()) {
              if (isDeploymentInsertConflict(insertResult.error)) {
                const conflictingDeploymentId =
                  typeof insertResult.error.details?.deploymentId === "string"
                    ? insertResult.error.details.deploymentId
                    : undefined;
                const conflictingStatus =
                  typeof insertResult.error.details?.status === "string"
                    ? insertResult.error.details.status
                    : undefined;
                const conflictingResourceId =
                  typeof insertResult.error.details?.resourceId === "string"
                    ? insertResult.error.details.resourceId
                    : deployment.toState().resourceId.value;

                return err(
                  redeployGuardErrorFromInsertConflict({
                    resourceId: conflictingResourceId,
                    ...(conflictingDeploymentId ? { deploymentId: conflictingDeploymentId } : {}),
                    ...(conflictingStatus ? { status: conflictingStatus } : {}),
                  }),
                );
              }

              yield* insertResult;
            }
            await publishDomainEventsAndReturn(context, eventBus, logger, deployment, undefined);

            const startResult = deploymentLifecycleService.startExecution(deployment);
            yield* startResult;

            const startPersistResult = yield* await persistDeployment(context, deployment);
            if (startPersistResult === "fenced") {
              return ok(deployment);
            }
            await publishDomainEventsAndReturn(context, eventBus, logger, deployment, undefined);

            return ok(deployment);
          }),
      });
      const deployment = yield* admittedDeploymentResult;
      const deploymentId = deployment.toState().id.value;

      reportDeploymentProgress(deploymentProgressReporter, context, {
        deploymentId,
        phase: "plan",
        status: "succeeded",
        step: deploymentProgressSteps.plan,
        message: context.t(i18nKeys.backend.deployment.selectedRuntimeStrategy, {
          buildStrategy: runtimePlan.buildStrategy,
          executionKind: runtimePlan.execution.kind,
        }),
      });

      const executionResult = await executionBackend.execute(context, deployment);
      if (executionResult.isErr()) {
        if (isExecutionSupersededError(executionResult.error)) {
          return ok({ id: deployment.toState().id.value });
        }

        const failureResult = deploymentLifecycleService.failExecution(
          deployment,
          executionResult.error,
        );
        yield* failureResult;

        const failurePersistResult = yield* await persistDeployment(context, deployment);
        if (failurePersistResult === "fenced") {
          return ok({ id: deployment.toState().id.value });
        }
        await publishDomainEventsAndReturn(context, eventBus, logger, deployment, undefined);

        return ok({ id: deployment.toState().id.value });
      }

      const execution = executionResult.value;

      const terminalPersistResult = yield* await persistDeployment(context, execution.deployment);
      if (terminalPersistResult === "fenced") {
        return ok({ id: execution.deployment.toState().id.value });
      }
      await publishDomainEventsAndReturn(
        context,
        eventBus,
        logger,
        execution.deployment,
        undefined,
      );

      return ok({ id: execution.deployment.toState().id.value });
    });
  }
}
