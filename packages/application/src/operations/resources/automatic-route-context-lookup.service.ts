import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type DeploymentReadModel,
  type DeploymentSummary,
  type DomainBindingReadModel,
  type DomainBindingSummary,
  type PlannedResourceAccessRouteSummary,
  type ResourceAccessRouteSummary,
  type ResourceReadModel,
  type ResourceSummary,
} from "../../ports";
import {
  type AppliedRouteContextMetadata,
  appliedRouteContextToDiagnosticRoute,
  type ResourceAccessFailureDiagnostic,
  type ResourceAccessFailureNextAction,
  type ResourceAccessFailureRouteContext,
  type ResourceAccessRouteSource,
} from "../../resource-access-failure-diagnostics";
import { tokens } from "../../tokens";

export type AutomaticRouteContextMatchedSource =
  | "generated-access-route"
  | "durable-domain-binding-route"
  | "server-applied-route"
  | "planned-generated-access-route"
  | "deployment-snapshot-route"
  | "not-found";

export type AutomaticRouteContextConfidence = "high" | "medium" | "low";

export interface AutomaticRouteContextLookupInput {
  hostname: string;
  path: string;
  requestId?: string;
  method?: string;
  observedAt?: string;
  routeSource?: ResourceAccessRouteSource;
  appliedRouteContext?: AppliedRouteContextMetadata;
}

export interface AutomaticRouteContextFound {
  schemaVersion: "automatic-route-context-lookup/v1";
  status: "found";
  matchedSource: Exclude<AutomaticRouteContextMatchedSource, "not-found">;
  hostname: string;
  pathPrefix: string;
  resourceId: string;
  deploymentId?: string;
  domainBindingId?: string;
  serverId?: string;
  destinationId?: string;
  providerKey?: string;
  routeId: string;
  routeSource: ResourceAccessRouteSource;
  routeStatus: string;
  confidence: AutomaticRouteContextConfidence;
  nextAction: ResourceAccessFailureNextAction;
}

export interface AutomaticRouteContextNotFound {
  schemaVersion: "automatic-route-context-lookup/v1";
  status: "not-found";
  matchedSource: "not-found";
  hostname: string;
  path: string;
  confidence: "low";
  nextAction: "diagnostic-summary";
  notFound: {
    code: "resource_access_route_context_not_found";
    category: "not-found";
    phase: "route-context-lookup";
    retriable: false;
    message: string;
  };
}

export type AutomaticRouteContextLookupResult =
  | AutomaticRouteContextFound
  | AutomaticRouteContextNotFound;

export interface AutomaticRouteContextLookup {
  lookup(
    context: ExecutionContext,
    input: AutomaticRouteContextLookupInput,
  ): Promise<AutomaticRouteContextLookupResult>;
}

interface Candidate {
  matchedSource: Exclude<AutomaticRouteContextMatchedSource, "not-found">;
  resource: ResourceSummary;
  hostname: string;
  pathPrefix: string;
  deploymentId?: string;
  domainBinding?: DomainBindingSummary;
  providerKey?: string;
  routeSource: ResourceAccessRouteSource;
  routeStatus: string;
  sourceRank: number;
}

const routeSourceByMatchedSource: Record<
  Exclude<AutomaticRouteContextMatchedSource, "not-found">,
  ResourceAccessRouteSource
> = {
  "generated-access-route": "generated-default",
  "durable-domain-binding-route": "durable-domain",
  "server-applied-route": "server-applied",
  "planned-generated-access-route": "generated-default",
  "deployment-snapshot-route": "deployment-snapshot",
};

function normalizeHostname(input: string): string {
  return input.trim().toLowerCase().replace(/:\d+$/, "");
}

function normalizePath(input: string): string {
  const trimmed = input.trim();
  const withoutFragment = trimmed.split("#", 1)[0] ?? "";
  const withoutQuery = withoutFragment.split("?", 1)[0] ?? "";
  if (!withoutQuery) {
    return "/";
  }

  return withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
}

function pathMatches(path: string, prefix: string): boolean {
  const normalizedPrefix = normalizePath(prefix);
  if (normalizedPrefix === "/") {
    return true;
  }

  return path === normalizedPrefix || path.startsWith(`${normalizedPrefix}/`);
}

function routeStatusFrom(
  resource: ResourceSummary,
  route?: ResourceAccessRouteSummary | PlannedResourceAccessRouteSummary,
): string {
  if (resource.accessSummary?.proxyRouteStatus) {
    return resource.accessSummary.proxyRouteStatus;
  }

  if (route && "deploymentStatus" in route) {
    return route.deploymentStatus === "succeeded" ? "ready" : route.deploymentStatus;
  }

  return "planned";
}

function durableStatus(binding: DomainBindingSummary): string {
  switch (binding.status) {
    case "ready":
      return "ready";
    case "failed":
      return "failed";
    case "deleted":
      return "not-ready";
    default:
      return "not-ready";
  }
}

function sourceRankForDurable(binding?: DomainBindingSummary): number {
  return binding?.status === "ready" ? 10 : 20;
}

function routeIdFor(input: {
  source: AutomaticRouteContextMatchedSource;
  resourceId: string;
  hostname: string;
  pathPrefix: string;
  deploymentId?: string;
  domainBindingId?: string;
}): string {
  const raw = [
    input.source,
    input.resourceId,
    input.deploymentId,
    input.domainBindingId,
    input.hostname,
    input.pathPrefix,
  ]
    .filter((part): part is string => Boolean(part))
    .join(":");

  return raw.replace(/[^a-zA-Z0-9_.:/-]/g, "_").slice(0, 220);
}

function confidenceFor(
  candidate: Candidate,
  routeSourceHint?: ResourceAccessRouteSource,
): AutomaticRouteContextConfidence {
  if (!routeSourceHint || routeSourceHint === candidate.routeSource) {
    return "high";
  }

  return "medium";
}

function notFound(input: { hostname: string; path: string }): AutomaticRouteContextNotFound {
  return {
    schemaVersion: "automatic-route-context-lookup/v1",
    status: "not-found",
    matchedSource: "not-found",
    hostname: input.hostname,
    path: input.path,
    confidence: "low",
    nextAction: "diagnostic-summary",
    notFound: {
      code: "resource_access_route_context_not_found",
      category: "not-found",
      phase: "route-context-lookup",
      retriable: false,
      message: "No safe route context matched the hostname and path.",
    },
  };
}

function findDeployment(
  deployments: DeploymentSummary[],
  deploymentId: string | undefined,
): DeploymentSummary | undefined {
  if (!deploymentId) {
    return undefined;
  }

  return deployments.find((deployment) => deployment.id === deploymentId);
}

function routeCandidate(input: {
  matchedSource: Exclude<AutomaticRouteContextMatchedSource, "not-found">;
  resource: ResourceSummary;
  route: ResourceAccessRouteSummary | PlannedResourceAccessRouteSummary;
  sourceRank: number;
  domainBinding?: DomainBindingSummary;
}): Candidate {
  const deploymentId = "deploymentId" in input.route ? input.route.deploymentId : undefined;

  return {
    matchedSource: input.matchedSource,
    resource: input.resource,
    hostname: normalizeHostname(input.route.hostname),
    pathPrefix: normalizePath(input.route.pathPrefix),
    ...(deploymentId ? { deploymentId } : {}),
    ...(input.domainBinding ? { domainBinding: input.domainBinding } : {}),
    ...(input.route.providerKey ? { providerKey: input.route.providerKey } : {}),
    routeSource: routeSourceByMatchedSource[input.matchedSource],
    routeStatus:
      input.domainBinding && input.matchedSource === "durable-domain-binding-route"
        ? durableStatus(input.domainBinding)
        : routeStatusFrom(input.resource, input.route),
    sourceRank: input.sourceRank,
  };
}

function bindingCandidate(input: {
  resource: ResourceSummary;
  binding: DomainBindingSummary;
  deploymentId?: string;
}): Candidate {
  return {
    matchedSource: "durable-domain-binding-route",
    resource: input.resource,
    hostname: normalizeHostname(input.binding.domainName),
    pathPrefix: normalizePath(input.binding.pathPrefix),
    ...(input.deploymentId ? { deploymentId: input.deploymentId } : {}),
    domainBinding: input.binding,
    routeSource: "durable-domain",
    routeStatus: durableStatus(input.binding),
    sourceRank: sourceRankForDurable(input.binding),
  };
}

function matchingDomainBinding(
  bindings: DomainBindingSummary[],
  resource: ResourceSummary,
  hostname: string,
  pathPrefix: string,
): DomainBindingSummary | undefined {
  return bindings
    .filter(
      (binding) =>
        binding.resourceId === resource.id &&
        normalizeHostname(binding.domainName) === hostname &&
        normalizePath(binding.pathPrefix) === pathPrefix,
    )
    .sort((left, right) => sourceRankForDurable(left) - sourceRankForDurable(right))[0];
}

function latestDurableDeploymentId(resource: ResourceSummary): string | undefined {
  return resource.accessSummary?.latestDurableDomainRoute?.deploymentId;
}

export function routeContextToDiagnosticRoute(
  result: AutomaticRouteContextLookupResult,
): ResourceAccessFailureRouteContext | undefined {
  if (result.status !== "found") {
    return undefined;
  }

  return {
    host: result.hostname,
    pathPrefix: result.pathPrefix,
    resourceId: result.resourceId,
    ...(result.deploymentId ? { deploymentId: result.deploymentId } : {}),
    ...(result.domainBindingId ? { domainBindingId: result.domainBindingId } : {}),
    ...(result.serverId ? { serverId: result.serverId } : {}),
    ...(result.destinationId ? { destinationId: result.destinationId } : {}),
    ...(result.providerKey ? { providerKey: result.providerKey } : {}),
    routeId: result.routeId,
    routeSource: result.routeSource,
    routeStatus: result.routeStatus,
  };
}

function automaticRouteContextFromAppliedMetadata(
  metadata: AppliedRouteContextMetadata,
): AutomaticRouteContextFound {
  return {
    schemaVersion: "automatic-route-context-lookup/v1",
    status: "found",
    matchedSource:
      metadata.routeSource === "durable-domain"
        ? "durable-domain-binding-route"
        : metadata.routeSource === "server-applied"
          ? "server-applied-route"
          : metadata.routeSource === "deployment-snapshot"
            ? "deployment-snapshot-route"
            : "generated-access-route",
    hostname: metadata.hostname,
    pathPrefix: metadata.pathPrefix,
    resourceId: metadata.resourceId,
    ...(metadata.deploymentId ? { deploymentId: metadata.deploymentId } : {}),
    ...(metadata.domainBindingId ? { domainBindingId: metadata.domainBindingId } : {}),
    ...(metadata.serverId ? { serverId: metadata.serverId } : {}),
    ...(metadata.destinationId ? { destinationId: metadata.destinationId } : {}),
    ...(metadata.providerKey ? { providerKey: metadata.providerKey } : {}),
    routeId: metadata.routeId,
    routeSource: metadata.routeSource,
    routeStatus: "applied",
    confidence: "high",
    nextAction: "diagnostic-summary",
  };
}

export async function enrichResourceAccessFailureDiagnosticWithRouteContext(
  context: ExecutionContext,
  diagnostic: ResourceAccessFailureDiagnostic,
  lookup: AutomaticRouteContextLookup,
  appliedRouteContext?: AppliedRouteContextMetadata,
): Promise<ResourceAccessFailureDiagnostic> {
  if (diagnostic.route?.resourceId) {
    return diagnostic;
  }

  if (appliedRouteContext) {
    return {
      ...diagnostic,
      route: appliedRouteContextToDiagnosticRoute(appliedRouteContext),
    };
  }

  if (!diagnostic.affected?.hostname || !diagnostic.affected.path) {
    return diagnostic;
  }

  const result = await lookup.lookup(context, {
    hostname: diagnostic.affected.hostname,
    path: diagnostic.affected.path,
    requestId: diagnostic.requestId,
    ...(diagnostic.affected.method ? { method: diagnostic.affected.method } : {}),
    ...(diagnostic.generatedAt ? { observedAt: diagnostic.generatedAt } : {}),
  });
  const route = routeContextToDiagnosticRoute(result);
  if (!route) {
    return diagnostic;
  }

  return {
    ...diagnostic,
    route,
  };
}

@injectable()
export class AutomaticRouteContextLookupService implements AutomaticRouteContextLookup {
  constructor(
    @inject(tokens.resourceReadModel)
    private readonly resourceReadModel: ResourceReadModel,
    @inject(tokens.domainBindingReadModel)
    private readonly domainBindingReadModel: DomainBindingReadModel,
    @inject(tokens.deploymentReadModel)
    private readonly deploymentReadModel: DeploymentReadModel,
  ) {}

  async lookup(
    context: ExecutionContext,
    input: AutomaticRouteContextLookupInput,
  ): Promise<AutomaticRouteContextLookupResult> {
    if (input.appliedRouteContext) {
      return automaticRouteContextFromAppliedMetadata(input.appliedRouteContext);
    }

    const repositoryContext = toRepositoryContext(context);
    const hostname = normalizeHostname(input.hostname);
    const path = normalizePath(input.path);
    const resources = await this.resourceReadModel.list(repositoryContext);
    const bindings = await this.domainBindingReadModel.list(repositoryContext);
    const resourceById = new Map(resources.map((resource) => [resource.id, resource]));
    const candidates: Candidate[] = [];

    for (const resource of resources) {
      const summary = resource.accessSummary;
      if (!summary) {
        continue;
      }

      if (summary.latestDurableDomainRoute) {
        const binding = matchingDomainBinding(
          bindings,
          resource,
          normalizeHostname(summary.latestDurableDomainRoute.hostname),
          normalizePath(summary.latestDurableDomainRoute.pathPrefix),
        );
        candidates.push(
          routeCandidate({
            matchedSource: "durable-domain-binding-route",
            resource,
            route: summary.latestDurableDomainRoute,
            sourceRank: sourceRankForDurable(binding),
            ...(binding ? { domainBinding: binding } : {}),
          }),
        );
      }

      if (summary.latestServerAppliedDomainRoute) {
        candidates.push(
          routeCandidate({
            matchedSource: "server-applied-route",
            resource,
            route: summary.latestServerAppliedDomainRoute,
            sourceRank: 30,
          }),
        );
      }

      if (summary.latestGeneratedAccessRoute) {
        candidates.push(
          routeCandidate({
            matchedSource: "generated-access-route",
            resource,
            route: summary.latestGeneratedAccessRoute,
            sourceRank: 40,
          }),
        );
      }

      if (summary.plannedGeneratedAccessRoute) {
        candidates.push(
          routeCandidate({
            matchedSource: "planned-generated-access-route",
            resource,
            route: summary.plannedGeneratedAccessRoute,
            sourceRank: 50,
          }),
        );
      }
    }

    for (const binding of bindings) {
      const resource = resourceById.get(binding.resourceId);
      if (!resource) {
        continue;
      }

      const deploymentId = latestDurableDeploymentId(resource);
      candidates.push(
        deploymentId
          ? bindingCandidate({
              resource,
              binding,
              deploymentId,
            })
          : bindingCandidate({
              resource,
              binding,
            }),
      );
    }

    const selected = candidates
      .filter(
        (candidate) => candidate.hostname === hostname && pathMatches(path, candidate.pathPrefix),
      )
      .sort((left, right) => {
        const rankCompare = left.sourceRank - right.sourceRank;
        if (rankCompare !== 0) {
          return rankCompare;
        }

        return right.pathPrefix.length - left.pathPrefix.length;
      })[0];

    if (!selected) {
      return notFound({ hostname, path });
    }

    const deployments = await this.deploymentReadModel.list(repositoryContext, {
      resourceId: selected.resource.id,
    });
    const deployment = findDeployment(deployments, selected.deploymentId);
    const domainBinding = selected.domainBinding;
    const serverId = domainBinding?.serverId ?? deployment?.serverId;
    const destinationId =
      domainBinding?.destinationId ?? deployment?.destinationId ?? selected.resource.destinationId;
    const routeId = routeIdFor({
      source: selected.matchedSource,
      resourceId: selected.resource.id,
      hostname: selected.hostname,
      pathPrefix: selected.pathPrefix,
      ...(selected.deploymentId ? { deploymentId: selected.deploymentId } : {}),
      ...(domainBinding?.id ? { domainBindingId: domainBinding.id } : {}),
    });

    return {
      schemaVersion: "automatic-route-context-lookup/v1",
      status: "found",
      matchedSource: selected.matchedSource,
      hostname: selected.hostname,
      pathPrefix: selected.pathPrefix,
      resourceId: selected.resource.id,
      ...(selected.deploymentId ? { deploymentId: selected.deploymentId } : {}),
      ...(domainBinding?.id ? { domainBindingId: domainBinding.id } : {}),
      ...(serverId ? { serverId } : {}),
      ...(destinationId ? { destinationId } : {}),
      ...(selected.providerKey ? { providerKey: selected.providerKey } : {}),
      routeId,
      routeSource: selected.routeSource,
      routeStatus: selected.routeStatus,
      confidence: confidenceFor(selected, input.routeSource),
      nextAction: "diagnostic-summary",
    };
  }
}
