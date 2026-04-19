import {
  domainError,
  err,
  LatestDeploymentSpec,
  ok,
  type Resource,
  type ResourceHealthCheckPolicyState,
  ResourceSourceBinding,
  type Result,
  SourceDescriptor,
  safeTry,
  UpsertDeploymentSpec,
} from "@appaloft/core";
import { i18nKeys } from "@appaloft/i18n";
import { inject, injectable } from "tsyringe";
import { deploymentProgressSteps, reportDeploymentProgress } from "../../deployment-progress";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type DeploymentProgressReporter,
  type DeploymentRepository,
  type DomainRouteBindingCandidate,
  type DomainRouteBindingReader,
  type EventBus,
  type ExecutionBackend,
  type RequestedDeploymentConfig,
  type RequestedDeploymentHealthCheck,
  type RuntimePlanResolver,
  type ServerAppliedRouteDesiredStateDomain,
  type ServerAppliedRouteDesiredStateReader,
  type ServerAppliedRouteDesiredStateRecord,
  type SourceDetector,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type CreateDeploymentCommandInput } from "./create-deployment.command";
import { type DeploymentFactory } from "./deployment.factory";
import { type DeploymentContextBootstrapService } from "./deployment-config-bootstrap.service";
import { type DeploymentContextResolver } from "./deployment-context.resolver";
import { type DeploymentLifecycleService } from "./deployment-lifecycle.service";
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
    ...(runtimeProfile?.publishDirectory
      ? { publishDirectory: runtimeProfile.publishDirectory.value }
      : {}),
    ...(internalPort ? { port: internalPort } : {}),
    ...(networkProfile
      ? {
          exposureMode: networkProfile.exposureMode.value,
          upstreamProtocol: networkProfile.upstreamProtocol.value,
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
          },
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

  const primaryBinding = bindings
    .filter((binding) => binding.proxyKind !== "none")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

  if (!primaryBinding) {
    return requestedDeployment;
  }

  const domains = bindings
    .filter(
      (binding) =>
        binding.proxyKind === primaryBinding.proxyKind &&
        binding.pathPrefix === primaryBinding.pathPrefix &&
        binding.tlsMode === primaryBinding.tlsMode,
    )
    .map((binding) => binding.domainName);

  return {
    ...requestedDeployment,
    proxyKind: primaryBinding.proxyKind,
    domains,
    pathPrefix: primaryBinding.pathPrefix,
    tlsMode: primaryBinding.tlsMode,
    accessRouteMetadata: {
      ...(requestedDeployment.accessRouteMetadata ?? {}),
      "access.routeSource": "durable-domain-binding",
      "access.domainBindingId": primaryBinding.id,
      "access.hostname": primaryBinding.domainName,
      "access.scheme": primaryBinding.tlsMode === "auto" ? "https" : "http",
    },
  };
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
}

function serverAppliedRouteGroups(
  domains: ServerAppliedRouteDesiredStateDomain[],
): ServerAppliedRouteGroup[] {
  const groups: ServerAppliedRouteGroup[] = [];
  const groupIndexes = new Map<string, number>();

  for (const domain of domains) {
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
  if (!primaryRoute) {
    return ok(input.requestedDeployment);
  }

  const proxyKind = input.proxyKind;
  const routeGroups = serverAppliedRouteGroups(input.desiredState.domains);
  const primaryRouteGroup = routeGroups[0];

  if (!primaryRouteGroup) {
    return ok(input.requestedDeployment);
  }

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
    })),
    accessRouteMetadata: {
      ...(input.requestedDeployment.accessRouteMetadata ?? {}),
      "access.routeSource": "server-applied-config-domain",
      "access.serverAppliedRouteSetId": input.desiredState.routeSetId,
      "access.hostname": primaryRoute.host,
      "access.scheme": primaryRoute.tlsMode === "auto" ? "https" : "http",
      "access.routeCount": String(input.desiredState.domains.length),
      "access.routeGroupCount": String(routeGroups.length),
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
    @inject(tokens.domainRouteBindingReader)
    private readonly domainRouteBindingReader?: DomainRouteBindingReader,
    @inject(tokens.serverAppliedRouteDesiredStateReader)
    private readonly serverAppliedRouteDesiredStateReader?: ServerAppliedRouteDesiredStateReader,
  ) {}

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
      deploymentProgressReporter,
      runtimePlanResolutionInputBuilder,
      runtimePlanResolver,
      serverAppliedRouteDesiredStateReader,
      sourceDetector,
    } = this;
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
      const latestDeployment = await deploymentRepository.findOne(
        repositoryContext,
        LatestDeploymentSpec.forResource(resource.toState().id),
      );

      if (latestDeployment && !latestDeployment.canStartNewDeployment()) {
        const latestDeploymentState = latestDeployment.toState();
        return err(
          domainError.deploymentNotRedeployable(
            "Latest deployment for this resource must be succeeded or failed before redeploying",
            {
              deploymentId: latestDeploymentState.id.value,
              resourceId: latestDeploymentState.resourceId.value,
              status: latestDeploymentState.status.value,
            },
          ),
        );
      }

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
      const snapshotResult = deploymentSnapshotFactory.create(environment);
      const snapshot = yield* snapshotResult;
      const requestedDeploymentBase = yield* requestedDeploymentFromResource(resource);
      const targetContext = {
        projectId: project.toState().id.value,
        environmentId: environment.toState().id.value,
        resourceId: resource.toState().id.value,
        serverId: server.toState().id.value,
        destinationId: destination.toState().id.value,
      };
      const serverAppliedRouteDesiredState = serverAppliedRouteDesiredStateReader
        ? yield* await serverAppliedRouteDesiredStateReader.read(targetContext)
        : null;
      const routeBindings = domainRouteBindingReader
        ? await domainRouteBindingReader.listDeployableBindings(repositoryContext, {
            projectId: targetContext.projectId,
            environmentId: targetContext.environmentId,
            resourceId: targetContext.resourceId,
            serverId: targetContext.serverId,
            destinationId: targetContext.destinationId,
          })
        : [];
      const requestedDeploymentWithServerAppliedRoute =
        yield* requestedDeploymentWithServerAppliedRoutes({
          requestedDeployment: requestedDeploymentBase,
          desiredState: serverAppliedRouteDesiredState,
          proxyKind: proxyKindFromServer(server),
        });
      const requestedDeployment = requestedDeploymentWithDurableDomainBindings(
        requestedDeploymentWithServerAppliedRoute,
        routeBindings,
      );
      const runtimePlanInputResult = runtimePlanResolutionInputBuilder.build({
        source: detected.source,
        server,
        environmentSnapshot: snapshot,
        detectedReasoning: detected.reasoning,
        requestedDeployment,
      });
      const runtimePlanInput = yield* runtimePlanInputResult;
      const runtimePlanResult = await runtimePlanResolver.resolve(context, runtimePlanInput);
      const runtimePlan = yield* runtimePlanResult;
      const deploymentResult = deploymentFactory.create({
        project,
        server,
        destination,
        environment,
        resource,
        runtimePlan,
        environmentSnapshot: snapshot,
      });
      const deployment = yield* deploymentResult;
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

      const prepareResult = deploymentLifecycleService.prepareForExecution(deployment);
      yield* prepareResult;

      await deploymentRepository.upsert(
        repositoryContext,
        deployment,
        UpsertDeploymentSpec.fromDeployment(deployment),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, deployment, undefined);

      const startResult = deploymentLifecycleService.startExecution(deployment);
      yield* startResult;

      await deploymentRepository.upsert(
        repositoryContext,
        deployment,
        UpsertDeploymentSpec.fromDeployment(deployment),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, deployment, undefined);

      const executionResult = await executionBackend.execute(context, deployment);
      if (executionResult.isErr()) {
        const failureResult = deploymentLifecycleService.failExecution(
          deployment,
          executionResult.error,
        );
        yield* failureResult;

        await deploymentRepository.upsert(
          repositoryContext,
          deployment,
          UpsertDeploymentSpec.fromDeployment(deployment),
        );
        await publishDomainEventsAndReturn(context, eventBus, logger, deployment, undefined);

        return ok({ id: deployment.toState().id.value });
      }

      const execution = executionResult.value;

      await deploymentRepository.upsert(
        repositoryContext,
        execution.deployment,
        UpsertDeploymentSpec.fromDeployment(execution.deployment),
      );
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
