import {
  type DomainError,
  domainError,
  ok,
  type Resource,
  type Result,
  SourceDescriptor,
  safeTry,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type DeploymentPlanPreview,
  type DeploymentPlanReason,
  type DeploymentPlanReasonCode,
  type DomainRouteBindingCandidate,
  type DomainRouteBindingReader,
  type RequestedDeploymentConfig,
  type RuntimePlanResolver,
  type RuntimeTargetBackendRegistry,
  type RuntimeTargetCapability,
  type ServerAppliedRouteDesiredStateDomain,
  type ServerAppliedRouteDesiredStateReader,
  type ServerAppliedRouteDesiredStateRecord,
  ServerAppliedRouteStateByTargetSpec,
  type SourceDetector,
} from "../../ports";
import { tokens } from "../../tokens";
import { type DeploymentContextResolver } from "./deployment-context.resolver";
import { type DeploymentPlanQuery } from "./deployment-plan.query";
import { type DeploymentSnapshotFactory } from "./deployment-snapshot.factory";
import { type RuntimePlanResolutionInputBuilder } from "./runtime-plan-resolution-input.builder";

function createResourceSourceDescriptor(
  resource: Resource,
): Result<{ source: SourceDescriptor; reasoning: string[] }> {
  return resource.createDeploymentSourceDescriptor().map((descriptor) => ({
    source: SourceDescriptor.rehydrate(descriptor.source),
    reasoning: descriptor.reasoning,
  }));
}

function shouldEnrichSourceFromDetector(resource: Resource): boolean {
  return resource.shouldEnrichSourceFromDetector();
}

function requestedDeploymentFromResource(resource: Resource): Result<RequestedDeploymentConfig> {
  return resource.resolveDeploymentProfile({ queryName: "deployments.plan" });
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

interface DeploymentPlanRuntimeContext {
  project: import("@appaloft/core").Project;
  environment: import("@appaloft/core").Environment;
  resource: Resource;
  server: Parameters<RuntimePlanResolutionInputBuilder["build"]>[0]["server"];
  destination: import("@appaloft/core").Destination;
}

function requestedDeploymentWithRuntimeContextMetadata(
  requestedDeployment: RequestedDeploymentConfig,
  input: DeploymentPlanRuntimeContext,
): RequestedDeploymentConfig {
  return {
    ...requestedDeployment,
    runtimeMetadata: {
      ...(requestedDeployment.runtimeMetadata ?? {}),
      ...DeploymentPlanQueryService.contextMetadata(input),
    },
  };
}

interface DomainBindingRouteGroup {
  domains: string[];
  pathPrefix: DomainRouteBindingCandidate["pathPrefix"];
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

    groups[existingIndex]?.domains.push(binding.domainName);
  }

  return groups;
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
  const primaryBinding =
    servedBindings.find((binding) => binding.status === "ready") ??
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
    },
  };
}

function proxyKindFromServer(
  server: Parameters<RuntimePlanResolutionInputBuilder["build"]>[0]["server"],
): NonNullable<RequestedDeploymentConfig["proxyKind"]> | undefined {
  return server.selectEdgeProxyKindForGeneratedRoutes()?.value;
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
    groups[existingIndex]?.domains.push(domain.host);
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

  const routeGroups = serverAppliedRouteGroups(input.desiredState.domains);
  const primaryRouteGroup = routeGroups.find((group) => !group.redirectTo) ?? routeGroups[0];
  if (!primaryRouteGroup) {
    return ok(input.requestedDeployment);
  }
  const proxyKind = input.proxyKind;

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
      "access.hostname": primaryServedRoute?.host ?? primaryRoute.host,
      "access.scheme":
        (primaryServedRoute?.tlsMode ?? primaryRoute.tlsMode) === "auto" ? "https" : "http",
      "access.routeCount": String(input.desiredState.domains.length),
      "access.routeGroupCount": String(routeGroups.length),
    },
  });
}

function requiredRuntimeTargetCapabilities(runtimePlan: {
  execution: { accessRoutes: readonly unknown[] };
}): RuntimeTargetCapability[] {
  const capabilities: RuntimeTargetCapability[] = [
    "runtime.apply",
    "runtime.verify",
    "runtime.logs",
  ];
  if (runtimePlan.execution.accessRoutes.length > 0) {
    capabilities.push("proxy.route");
  }
  return capabilities;
}

function reason(input: {
  code: DeploymentPlanReasonCode;
  category?: DeploymentPlanReason["category"];
  phase: string;
  message: string;
  recommendation?: string;
  evidence?: DeploymentPlanReason["evidence"];
  fixPath?: DeploymentPlanReason["fixPath"];
  overridePath?: DeploymentPlanReason["overridePath"];
  affectedProfileField?: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
}): DeploymentPlanReason {
  return {
    code: input.code,
    reasonCode: input.code,
    category: input.category ?? "blocked",
    phase: input.phase,
    message: input.message,
    ...(input.recommendation ? { recommendation: input.recommendation } : {}),
    ...(input.evidence ? { evidence: input.evidence } : {}),
    ...(input.fixPath ? { fixPath: input.fixPath } : {}),
    ...(input.overridePath ? { overridePath: input.overridePath } : {}),
    ...(input.affectedProfileField ? { affectedProfileField: input.affectedProfileField } : {}),
    ...(input.relatedEntityId ? { relatedEntityId: input.relatedEntityId } : {}),
    ...(input.relatedEntityType ? { relatedEntityType: input.relatedEntityType } : {}),
  };
}

function knownReasonCode(value: string | undefined): DeploymentPlanReasonCode | undefined {
  switch (value) {
    case "resource-source-missing":
    case "resource-source-unnormalized":
    case "runtime-profile-missing":
    case "network-profile-missing":
    case "internal-port-missing":
    case "missing-internal-port":
    case "static-publish-directory-missing":
    case "compose-target-service-missing":
    case "unsupported-framework":
    case "unsupported-runtime-family":
    case "ambiguous-framework":
    case "ambiguous-framework-evidence":
    case "ambiguous-build-tool":
    case "ambiguous-jvm-build-tool":
    case "ambiguous-python-app-target":
    case "missing-asgi-app":
    case "missing-build-tool":
    case "missing-jvm-build-tool":
    case "missing-runnable-jar":
    case "missing-wsgi-app":
    case "missing-python-app-target":
    case "missing-start-intent":
    case "missing-build-intent":
    case "missing-production-start-command":
    case "missing-static-output":
    case "missing-source-root":
    case "missing-artifact-output":
    case "incompatible-source-strategy":
    case "runtime-target-unsupported":
    case "unsupported-runtime-target":
    case "unsupported-container-native-profile":
    case "access-plan-unavailable":
    case "buildpack-disabled":
    case "buildpack-target-unavailable":
    case "unsupported-buildpack-builder":
    case "unsupported-buildpack-lifecycle-feature":
    case "ambiguous-buildpack-evidence":
    case "missing-buildpack-evidence":
    case "buildpack-start-intent-missing":
    case "buildpack-preview-limited":
      return value;
  }
}

function sharedPlanReasonCode(error: DomainError): DeploymentPlanReasonCode {
  const detailReason =
    typeof error.details?.reasonCode === "string" ? error.details.reasonCode : undefined;
  const direct = knownReasonCode(detailReason);
  if (direct) {
    switch (direct) {
      case "ambiguous-framework":
      case "ambiguous-python-app-target":
        return "ambiguous-framework-evidence";
      case "ambiguous-jvm-build-tool":
        return "ambiguous-build-tool";
      case "missing-jvm-build-tool":
        return "missing-build-tool";
      case "missing-runnable-jar":
      case "missing-static-output":
      case "static-publish-directory-missing":
        return "missing-artifact-output";
      case "missing-asgi-app":
      case "missing-wsgi-app":
      case "missing-python-app-target":
      case "missing-production-start-command":
      case "buildpack-start-intent-missing":
        return "missing-start-intent";
      case "internal-port-missing":
        return "missing-internal-port";
      case "runtime-target-unsupported":
        return "unsupported-runtime-target";
      default:
        return direct;
    }
  }

  const phase = typeof error.details?.phase === "string" ? error.details.phase : undefined;
  if (phase === "resource-network-resolution") {
    return "missing-internal-port";
  }
  if (phase === "runtime-target-resolution" || error.code === "runtime_target_unsupported") {
    return "unsupported-runtime-target";
  }
  if (phase === "resource-source-resolution") {
    return "resource-source-missing";
  }
  if (phase === "runtime-plan-resolution") {
    return "unsupported-framework";
  }
  return "unsupported-framework";
}

function affectedProfileField(reasonCode: DeploymentPlanReasonCode): string | undefined {
  switch (reasonCode) {
    case "ambiguous-framework-evidence":
    case "missing-source-root":
      return "source.baseDirectory";
    case "ambiguous-build-tool":
    case "missing-build-tool":
    case "missing-build-intent":
    case "missing-artifact-output":
      return "runtime.buildCommand";
    case "missing-start-intent":
    case "unsupported-framework":
    case "unsupported-runtime-family":
      return "runtime.startCommand";
    case "missing-internal-port":
    case "internal-port-missing":
      return "network.internalPort";
    case "unsupported-container-native-profile":
      return "runtime.dockerfilePath";
  }
}

function fixOperation(reasonCode: DeploymentPlanReasonCode): string {
  switch (reasonCode) {
    case "missing-internal-port":
    case "internal-port-missing":
    case "network-profile-missing":
      return "resources.configure-network";
    case "resource-source-missing":
    case "resource-source-unnormalized":
    case "missing-source-root":
    case "ambiguous-framework-evidence":
      return "resources.configure-source";
    default:
      return "resources.configure-runtime";
  }
}

function blockedReasonFromError(error: DomainError): DeploymentPlanReason {
  const reasonCode = sharedPlanReasonCode(error);
  const phase =
    typeof error.details?.phase === "string" ? error.details.phase : "runtime-plan-resolution";
  const profileField = affectedProfileField(reasonCode);
  const targetOperation = fixOperation(reasonCode);
  const fixPath = [
    {
      kind: "command" as const,
      targetOperation,
      label: "Fix resource profile",
      ...(profileField ? { profileField } : {}),
      safeByDefault: true,
    },
  ];
  const overridePath =
    reasonCode === "missing-internal-port" || reasonCode === "internal-port-missing"
      ? []
      : [
          {
            kind: "command" as const,
            targetOperation: "resources.configure-runtime",
            label: "Use explicit runtime or container-native profile",
            profileField: "runtime.startCommand",
            safeByDefault: true,
          },
        ];

  return reason({
    code: reasonCode,
    phase,
    message: error.message,
    recommendation: "Fix the resource profile or provide an explicit override before deploying.",
    evidence: Object.entries(error.details ?? {})
      .filter(([key]) => key !== "phase" && key !== "reasonCode")
      .map(([key, value]) => ({
        kind: key,
        label: key,
        value: Array.isArray(value) ? value.join(",") : String(value),
        source: "runtime-plan-resolution",
      })),
    fixPath,
    overridePath,
    ...(profileField ? { affectedProfileField: profileField } : {}),
  });
}

@injectable()
export class DeploymentPlanQueryService {
  constructor(
    @inject(tokens.deploymentContextResolver)
    private readonly deploymentContextResolver: DeploymentContextResolver,
    @inject(tokens.sourceDetector)
    private readonly sourceDetector: SourceDetector,
    @inject(tokens.runtimePlanResolver)
    private readonly runtimePlanResolver: RuntimePlanResolver,
    @inject(tokens.deploymentSnapshotFactory)
    private readonly deploymentSnapshotFactory: DeploymentSnapshotFactory,
    @inject(tokens.runtimePlanResolutionInputBuilder)
    private readonly runtimePlanResolutionInputBuilder: RuntimePlanResolutionInputBuilder,
    @inject(tokens.runtimeTargetBackendRegistry)
    private readonly runtimeTargetBackendRegistry: RuntimeTargetBackendRegistry,
    @inject(tokens.domainRouteBindingReader)
    private readonly domainRouteBindingReader?: DomainRouteBindingReader,
    @inject(tokens.serverAppliedRouteStateRepository)
    private readonly serverAppliedRouteStateRepository?: ServerAppliedRouteDesiredStateReader,
  ) {}

  static contextMetadata(input: DeploymentPlanRuntimeContext): Record<string, string> {
    const projectState = input.project.toState();
    const environmentState = input.environment.toState();
    const resourceState = input.resource.toState();
    const serverState = input.server.toState();
    const destinationState = input.destination.toState();

    return compactMetadata({
      "context.projectName": projectState.name.value,
      "context.projectSlug": projectState.slug.value,
      "context.environmentName": environmentState.name.value,
      "context.environmentKind": environmentState.kind.value,
      "context.resourceName": resourceState.name.value,
      "context.resourceSlug": resourceState.slug.value,
      "context.resourceKind": resourceState.kind.value,
      "context.destinationName": destinationState.name.value,
      "context.destinationKind": destinationState.kind.value,
      "context.serverName": serverState.name.value,
      "context.serverProviderKey": serverState.providerKey.value,
      "context.serverTargetKind": serverState.targetKind.value,
    });
  }

  async execute(
    context: ExecutionContext,
    query: DeploymentPlanQuery,
  ): Promise<Result<DeploymentPlanPreview>> {
    const {
      deploymentContextResolver,
      deploymentSnapshotFactory,
      domainRouteBindingReader,
      runtimePlanResolutionInputBuilder,
      runtimePlanResolver,
      runtimeTargetBackendRegistry,
      serverAppliedRouteStateRepository,
      sourceDetector,
    } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const resolvedContext = yield* await deploymentContextResolver.resolve(context, {
        projectId: query.projectId,
        environmentId: query.environmentId,
        resourceId: query.resourceId,
        serverId: query.serverId,
        ...(query.destinationId ? { destinationId: query.destinationId } : {}),
      });
      const { project, environment, resource, server, destination } = resolvedContext;

      const resourceSource = yield* createResourceSourceDescriptor(resource);
      let detected = resourceSource;
      if (shouldEnrichSourceFromDetector(resource)) {
        detected = yield* await sourceDetector.detect(context, resourceSource.source.locator);
      }

      const snapshot = yield* deploymentSnapshotFactory.create(environment, resource);
      const requestedDeploymentBaseResult = requestedDeploymentFromResource(resource);
      if (requestedDeploymentBaseResult.isErr()) {
        return ok(
          blockedDeploymentPlanPreview({
            destination,
            environment,
            error: requestedDeploymentBaseResult.error,
            project,
            resource,
            server,
            source: detected.source,
            sourceReasoning: detected.reasoning,
          }),
        );
      }
      const requestedDeploymentBase = requestedDeploymentBaseResult.value;
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
      if (!serverAppliedRouteDesiredState && serverAppliedRouteStateRepository) {
        serverAppliedRouteDesiredState = yield* await serverAppliedRouteStateRepository.findOne(
          ServerAppliedRouteStateByTargetSpec.create({
            projectId: targetContext.projectId,
            environmentId: targetContext.environmentId,
            resourceId: targetContext.resourceId,
            serverId: targetContext.serverId,
          }),
        );
      }
      const routeBindings =
        query.includeAccessPlan && domainRouteBindingReader
          ? await domainRouteBindingReader.listDeployableBindings(repositoryContext, targetContext)
          : [];
      const requestedDeploymentWithDurableRoute = requestedDeploymentWithDurableDomainBindings(
        requestedDeploymentBase,
        routeBindings,
      );
      const requestedDeployment = yield* requestedDeploymentWithServerAppliedRoutes({
        requestedDeployment: requestedDeploymentWithDurableRoute,
        desiredState: query.includeAccessPlan ? serverAppliedRouteDesiredState : null,
        proxyKind: proxyKindFromServer(server),
      });
      const requestedDeploymentWithRuntimeMetadata = requestedDeploymentWithRuntimeContextMetadata(
        requestedDeployment,
        { project, environment, resource, server, destination },
      );
      const runtimePlanInput = yield* runtimePlanResolutionInputBuilder.build({
        source: detected.source,
        server,
        environmentSnapshot: snapshot,
        detectedReasoning: detected.reasoning,
        requestedDeployment: requestedDeploymentWithRuntimeMetadata,
      });
      const runtimePlanResult = await runtimePlanResolver.resolve(context, runtimePlanInput);
      if (runtimePlanResult.isErr()) {
        return ok(
          blockedDeploymentPlanPreview({
            destination,
            environment,
            error: runtimePlanResult.error,
            project,
            resource,
            server,
            source: detected.source,
            sourceReasoning: detected.reasoning,
          }),
        );
      }
      const runtimePlan = runtimePlanResult.value;
      const runtimeTargetBackend = runtimeTargetBackendRegistry.find({
        targetKind: runtimePlan.target.kind,
        providerKey: runtimePlan.target.providerKey,
        requiredCapabilities: requiredRuntimeTargetCapabilities(runtimePlan),
      });
      if (runtimeTargetBackend.isErr()) {
        return ok(
          deploymentPlanPreview({
            destination,
            environment,
            includeCommandSpecs: query.includeCommandSpecs,
            project,
            resource,
            runtimePlan,
            sourceReasoning: detected.reasoning,
            server,
            unsupportedReasons: [
              blockedReasonFromError(
                domainError.runtimeTargetUnsupported(runtimeTargetBackend.error.message, {
                  ...(runtimeTargetBackend.error.details ?? {}),
                  queryName: "deployments.plan",
                  phase: "runtime-target-resolution",
                  projectId: targetContext.projectId,
                  environmentId: targetContext.environmentId,
                  resourceId: targetContext.resourceId,
                  serverId: targetContext.serverId,
                  destinationId: targetContext.destinationId,
                  runtimePlanStrategy: requestedDeploymentWithRuntimeMetadata.method,
                  targetKind: runtimePlan.target.kind,
                  targetProviderKey: runtimePlan.target.providerKey,
                }),
              ),
            ],
          }),
        );
      }

      return ok(
        deploymentPlanPreview({
          destination,
          environment,
          includeCommandSpecs: query.includeCommandSpecs,
          project,
          resource,
          runtimePlan,
          sourceReasoning: detected.reasoning,
          server,
        }),
      );
    });
  }
}

function blockedDeploymentPlanPreview(input: {
  project: import("@appaloft/core").Project;
  environment: import("@appaloft/core").Environment;
  resource: Resource;
  server: Parameters<RuntimePlanResolutionInputBuilder["build"]>[0]["server"];
  destination: import("@appaloft/core").Destination;
  source: SourceDescriptor;
  sourceReasoning: string[];
  error: DomainError;
}): DeploymentPlanPreview {
  const projectState = input.project.toState();
  const environmentState = input.environment.toState();
  const resourceState = input.resource.toState();
  const serverState = input.server.toState();
  const destinationState = input.destination.toState();
  const sourceState = input.source.toState();
  const sourceInspection = sourceState.inspection;
  const unsupportedReason = blockedReasonFromError(input.error);
  const runtimeStrategy = resourceState.runtimeProfile?.strategy.value;

  return {
    schemaVersion: "deployments.plan/v1",
    context: {
      projectId: projectState.id.value,
      environmentId: environmentState.id.value,
      resourceId: resourceState.id.value,
      serverId: serverState.id.value,
      destinationId: destinationState.id.value,
      projectName: projectState.name.value,
      environmentName: environmentState.name.value,
      resourceName: resourceState.name.value,
      serverName: serverState.name.value,
    },
    readiness: {
      status: "blocked",
      ready: false,
      reasonCodes: [unsupportedReason.code],
    },
    source: {
      kind: sourceState.kind.value,
      displayName: sourceState.displayName.value,
      locator: sourceState.locator.value,
      ...(sourceInspection?.runtimeFamily ? { runtimeFamily: sourceInspection.runtimeFamily } : {}),
      ...(sourceInspection?.framework ? { framework: sourceInspection.framework } : {}),
      ...(sourceInspection?.packageManager
        ? { packageManager: sourceInspection.packageManager }
        : {}),
      ...(sourceInspection?.applicationShape
        ? { applicationShape: sourceInspection.applicationShape }
        : {}),
      ...(sourceInspection?.runtimeVersion
        ? { runtimeVersion: sourceInspection.runtimeVersion }
        : {}),
      ...(sourceInspection?.projectName ? { projectName: sourceInspection.projectName } : {}),
      detectedFiles: sourceInspection?.detectedFiles ?? [],
      detectedScripts: sourceInspection?.detectedScripts ?? [],
      ...(sourceInspection?.dockerfilePath
        ? { dockerfilePath: sourceInspection.dockerfilePath }
        : {}),
      ...(sourceInspection?.composeFilePath
        ? { composeFilePath: sourceInspection.composeFilePath }
        : {}),
      ...(sourceInspection?.jarPath ? { jarPath: sourceInspection.jarPath } : {}),
      reasoning: input.sourceReasoning,
    },
    planner: {
      plannerKey: "unsupported",
      supportTier:
        unsupportedReason.code === "ambiguous-framework-evidence" ||
        unsupportedReason.code === "ambiguous-build-tool"
          ? "requires-override"
          : "unsupported",
      buildStrategy:
        runtimeStrategy === "dockerfile"
          ? "dockerfile"
          : runtimeStrategy === "docker-compose"
            ? "compose-deploy"
            : runtimeStrategy === "prebuilt-image"
              ? "prebuilt-image"
              : runtimeStrategy === "static"
                ? "static-artifact"
                : "workspace-commands",
      packagingMode: "all-in-one-docker",
      targetKind: serverState.targetKind.value,
      targetProviderKey: serverState.providerKey.value,
    },
    artifact: {
      kind: "workspace-image",
    },
    commands: [],
    network: {
      ...(resourceState.networkProfile?.internalPort
        ? { internalPort: resourceState.networkProfile.internalPort.value }
        : {}),
      ...(resourceState.networkProfile
        ? {
            upstreamProtocol: resourceState.networkProfile.upstreamProtocol.value,
            exposureMode: resourceState.networkProfile.exposureMode.value,
            ...(resourceState.networkProfile.hostPort
              ? { hostPort: resourceState.networkProfile.hostPort.value }
              : {}),
            ...(resourceState.networkProfile.targetServiceName
              ? { targetServiceName: resourceState.networkProfile.targetServiceName.value }
              : {}),
          }
        : {}),
    },
    health: {
      enabled: false,
      kind: "none",
    },
    warnings: [],
    unsupportedReasons: [unsupportedReason],
    nextActions: nextActions([unsupportedReason]),
    generatedAt: new Date().toISOString(),
  };
}

/*
 * The remaining preview builder is used once runtime plan resolution succeeds. Unsupported
 * reasons may still be supplied for target-capability blockers discovered after planning.
 */
function deploymentPlanPreview(input: {
  project: import("@appaloft/core").Project;
  environment: import("@appaloft/core").Environment;
  resource: Resource;
  server: Parameters<RuntimePlanResolutionInputBuilder["build"]>[0]["server"];
  destination: import("@appaloft/core").Destination;
  runtimePlan: import("@appaloft/core").RuntimePlan;
  sourceReasoning: string[];
  includeCommandSpecs: boolean;
  unsupportedReasons?: DeploymentPlanReason[];
}): DeploymentPlanPreview {
  const projectState = input.project.toState();
  const environmentState = input.environment.toState();
  const resourceState = input.resource.toState();
  const serverState = input.server.toState();
  const destinationState = input.destination.toState();
  const runtimePlanState = input.runtimePlan.toState();
  const source = runtimePlanState.source;
  const sourceInspection = source.inspection;
  const execution = runtimePlanState.execution;
  const executionState = execution.toState();
  const runtimeArtifact = runtimePlanState.runtimeArtifact?.toState();
  const metadata = execution.metadata ?? {};
  const plannerKey =
    metadata["workspace.planner"] ??
    runtimeArtifact?.metadata?.planner ??
    runtimePlanState.buildStrategy.value;
  const unsupportedReasons: DeploymentPlanReason[] = [...(input.unsupportedReasons ?? [])];
  const warnings: DeploymentPlanReason[] = [];
  const access = accessSummary(executionState.metadata);

  if (!input.includeCommandSpecs) {
    warnings.push(
      reason({
        code: "access-plan-unavailable",
        category: "info",
        phase: "command-preview",
        message: "Command specs were omitted by request.",
      }),
    );
  }

  const reasonCodes = unsupportedReasons.map((item) => item.code);

  return {
    schemaVersion: "deployments.plan/v1",
    context: {
      projectId: projectState.id.value,
      environmentId: environmentState.id.value,
      resourceId: resourceState.id.value,
      serverId: serverState.id.value,
      destinationId: destinationState.id.value,
      projectName: projectState.name.value,
      environmentName: environmentState.name.value,
      resourceName: resourceState.name.value,
      serverName: serverState.name.value,
    },
    readiness: {
      status: unsupportedReasons.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "ready",
      ready: unsupportedReasons.length === 0,
      reasonCodes,
    },
    source: {
      kind: source.kind,
      displayName: source.displayName,
      locator: source.locator,
      ...(sourceInspection?.runtimeFamily ? { runtimeFamily: sourceInspection.runtimeFamily } : {}),
      ...(sourceInspection?.framework ? { framework: sourceInspection.framework } : {}),
      ...(sourceInspection?.packageManager
        ? { packageManager: sourceInspection.packageManager }
        : {}),
      ...(sourceInspection?.applicationShape
        ? { applicationShape: sourceInspection.applicationShape }
        : {}),
      ...(sourceInspection?.runtimeVersion
        ? { runtimeVersion: sourceInspection.runtimeVersion }
        : {}),
      ...(sourceInspection?.projectName ? { projectName: sourceInspection.projectName } : {}),
      detectedFiles: sourceInspection?.detectedFiles ?? [],
      detectedScripts: sourceInspection?.detectedScripts ?? [],
      ...(sourceInspection?.dockerfilePath
        ? { dockerfilePath: sourceInspection.dockerfilePath }
        : {}),
      ...(sourceInspection?.composeFilePath
        ? { composeFilePath: sourceInspection.composeFilePath }
        : {}),
      ...(sourceInspection?.jarPath ? { jarPath: sourceInspection.jarPath } : {}),
      reasoning: input.sourceReasoning,
    },
    planner: {
      plannerKey,
      supportTier: supportTier(plannerKey, runtimePlanState.buildStrategy.value),
      buildStrategy: runtimePlanState.buildStrategy.value,
      packagingMode: runtimePlanState.packagingMode.value,
      targetKind: runtimePlanState.target.kind,
      targetProviderKey: runtimePlanState.target.providerKey,
    },
    artifact: {
      kind: artifactKind(runtimePlanState.buildStrategy.value, plannerKey),
      ...(runtimeArtifact ? { runtimeArtifactKind: runtimeArtifact.kind.value } : {}),
      ...(runtimeArtifact ? { runtimeArtifactIntent: runtimeArtifact.intent.value } : {}),
      ...(runtimeArtifact?.image ? { image: runtimeArtifact.image.value } : {}),
      ...(runtimeArtifact?.composeFile ? { composeFile: runtimeArtifact.composeFile.value } : {}),
      ...(runtimeArtifact?.metadata ? { metadata: runtimeArtifact.metadata } : {}),
    },
    commands: input.includeCommandSpecs
      ? commandSpecs({
          installCommand: execution.installCommand,
          buildCommand: execution.buildCommand,
          startCommand: execution.startCommand,
        })
      : [],
    network: {
      ...(execution.port ? { internalPort: execution.port } : {}),
      ...(resourceState.networkProfile
        ? {
            upstreamProtocol: resourceState.networkProfile.upstreamProtocol.value,
            exposureMode: resourceState.networkProfile.exposureMode.value,
            ...(resourceState.networkProfile.hostPort
              ? { hostPort: resourceState.networkProfile.hostPort.value }
              : {}),
            ...(resourceState.networkProfile.targetServiceName
              ? { targetServiceName: resourceState.networkProfile.targetServiceName.value }
              : {}),
          }
        : {}),
    },
    health: {
      enabled: execution.healthCheck?.enabled ?? Boolean(execution.healthCheckPath),
      kind: execution.healthCheck?.type.value ?? (execution.healthCheckPath ? "http" : "none"),
      ...(execution.healthCheck?.http?.path
        ? { path: execution.healthCheck.http.path.value }
        : execution.healthCheckPath
          ? { path: execution.healthCheckPath }
          : {}),
      ...(execution.healthCheck?.http?.port ? { port: execution.healthCheck.http.port.value } : {}),
    },
    ...(access ? { access } : {}),
    warnings,
    unsupportedReasons,
    nextActions: nextActions(unsupportedReasons),
    generatedAt: runtimePlanState.generatedAt.value,
  };
}

function supportTier(
  plannerKey: string,
  buildStrategy: DeploymentPlanPreview["planner"]["buildStrategy"],
): DeploymentPlanPreview["planner"]["supportTier"] {
  if (
    buildStrategy === "dockerfile" ||
    buildStrategy === "compose-deploy" ||
    buildStrategy === "prebuilt-image"
  ) {
    return "container-native";
  }
  if (buildStrategy === "buildpack" || plannerKey === "buildpack") {
    return "buildpack-accelerated";
  }
  if (plannerKey === "custom") {
    return "explicit-custom";
  }
  if (
    plannerKey.startsWith("generic-") ||
    plannerKey === "generic-node" ||
    plannerKey === "generic-python"
  ) {
    return "generic";
  }
  return "first-class";
}

function artifactKind(
  buildStrategy: DeploymentPlanPreview["planner"]["buildStrategy"],
  plannerKey: string,
): DeploymentPlanPreview["artifact"]["kind"] {
  switch (buildStrategy) {
    case "dockerfile":
      return "dockerfile-image";
    case "compose-deploy":
      return "compose-project";
    case "prebuilt-image":
      return "prebuilt-image";
    case "static-artifact":
      return "static-server-image";
    case "workspace-commands":
      return plannerKey === "custom" ? "custom-command-image" : "workspace-image";
    case "buildpack":
      return "workspace-image";
  }
}

function commandSpecs(input: {
  installCommand: string | undefined;
  buildCommand: string | undefined;
  startCommand: string | undefined;
}): DeploymentPlanPreview["commands"] {
  return [
    ...(input.installCommand
      ? [{ kind: "install" as const, command: input.installCommand, source: "planner" as const }]
      : []),
    ...(input.buildCommand
      ? [{ kind: "build" as const, command: input.buildCommand, source: "planner" as const }]
      : []),
    ...(input.startCommand
      ? [{ kind: "start" as const, command: input.startCommand, source: "planner" as const }]
      : []),
  ];
}

function accessSummary(
  metadata?: Record<string, string>,
): DeploymentPlanPreview["access"] | undefined {
  if (!metadata) {
    return undefined;
  }

  const routeCount = metadata["access.routeCount"];
  const routeGroupCount = metadata["access.routeGroupCount"];

  return {
    ...(metadata["access.routeSource"] ? { routeSource: metadata["access.routeSource"] } : {}),
    ...(metadata["access.hostname"] ? { hostname: metadata["access.hostname"] } : {}),
    ...(metadata["access.scheme"] === "http" || metadata["access.scheme"] === "https"
      ? { scheme: metadata["access.scheme"] }
      : {}),
    ...(routeCount && Number.isInteger(Number(routeCount))
      ? { routeCount: Number(routeCount) }
      : {}),
    ...(routeGroupCount && Number.isInteger(Number(routeGroupCount))
      ? { routeGroupCount: Number(routeGroupCount) }
      : {}),
  };
}

function nextActions(
  unsupportedReasons: DeploymentPlanReason[],
): DeploymentPlanPreview["nextActions"] {
  if (unsupportedReasons.length === 0) {
    return [
      {
        kind: "command",
        targetOperation: "deployments.create",
        label: "Create deployment",
        safeByDefault: false,
      },
    ];
  }

  return unsupportedReasons.map((item) => ({
    kind: "command",
    targetOperation:
      item.code === "internal-port-missing" ||
      item.code === "missing-internal-port" ||
      item.code === "network-profile-missing"
        ? "resources.configure-network"
        : "resources.configure-runtime",
    label: item.recommendation ?? "Fix resource profile",
    safeByDefault: false,
    blockedReasonCode: item.code,
  }));
}
