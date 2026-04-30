import {
  type DomainBindingSummary,
  type ResourceAccessSummary,
  type RouteIntentStatusDescriptor,
} from "../../ports";

type AccessRoute =
  | NonNullable<ResourceAccessSummary["plannedGeneratedAccessRoute"]>
  | NonNullable<ResourceAccessSummary["latestGeneratedAccessRoute"]>;

function routeSourceLabel(source: RouteIntentStatusDescriptor["source"]): string {
  return source.replaceAll("-", "_");
}

function descriptorId(input: {
  source: RouteIntentStatusDescriptor["source"];
  hostname: string;
  pathPrefix: string;
  deploymentId?: string;
}): string {
  const suffix = input.deploymentId ?? "planned";
  return `${routeSourceLabel(input.source)}:${input.hostname}:${input.pathPrefix}:${suffix}`;
}

function proxyAppliedStatus(
  status: ResourceAccessSummary["proxyRouteStatus"] | undefined,
): RouteIntentStatusDescriptor["proxy"]["applied"] {
  switch (status) {
    case "ready":
      return "ready";
    case "failed":
      return "failed";
    case "not-ready":
      return "not-ready";
    case "unknown":
    case undefined:
      return "unknown";
  }
}

function blockingReason(
  status: ResourceAccessSummary["proxyRouteStatus"] | undefined,
): RouteIntentStatusDescriptor["blockingReason"] | undefined {
  switch (status) {
    case "failed":
      return "proxy_route_stale";
    case "not-ready":
      return "proxy_route_missing";
    case "unknown":
      return "observation_unavailable";
    case "ready":
    case undefined:
      return undefined;
  }
}

function recommendedAction(
  reason: RouteIntentStatusDescriptor["blockingReason"] | undefined,
): RouteIntentStatusDescriptor["recommendedAction"] {
  switch (reason) {
    case "proxy_route_missing":
    case "proxy_route_stale":
      return "inspect-proxy-preview";
    case "domain_not_verified":
      return "verify-domain";
    case "certificate_missing":
    case "certificate_expired_or_not_active":
      return "provide-certificate";
    case "dns_points_elsewhere":
      return "fix-dns";
    case "runtime_not_ready":
      return "check-health";
    case "health_check_failing":
      return "check-health";
    case "server_applied_route_unavailable":
      return "inspect-proxy-preview";
    case "observation_unavailable":
      return "diagnostic-summary";
    case undefined:
      return "none";
  }
}

function descriptorFromRoute(input: {
  resourceId: string;
  source: RouteIntentStatusDescriptor["source"];
  route: AccessRoute;
  proxyRouteStatus?: ResourceAccessSummary["proxyRouteStatus"];
}): RouteIntentStatusDescriptor {
  const deploymentId = "deploymentId" in input.route ? input.route.deploymentId : undefined;
  const routeId = descriptorId({
    source: input.source,
    hostname: input.route.hostname,
    pathPrefix: input.route.pathPrefix,
    ...(deploymentId ? { deploymentId } : {}),
  });
  const reason = blockingReason(input.proxyRouteStatus);
  const status = reason ? (input.proxyRouteStatus ?? "unknown") : "available";

  return {
    schemaVersion: "route-intent-status/v1",
    routeId,
    diagnosticId: routeId,
    source: input.source,
    intent: {
      host: input.route.hostname,
      pathPrefix: input.route.pathPrefix,
      protocol: input.route.scheme,
      routeBehavior: "serve",
    },
    context: {
      resourceId: input.resourceId,
      ...(deploymentId ? { deploymentId } : {}),
    },
    proxy: {
      intent: input.route.proxyKind === "none" ? "not-required" : "required",
      applied: proxyAppliedStatus(input.proxyRouteStatus),
      ...(input.route.providerKey ? { providerKey: input.route.providerKey } : {}),
    },
    domainVerification: input.source === "durable-domain-binding" ? "verified" : "not-applicable",
    tls: input.route.scheme === "https" ? "active" : "disabled",
    runtimeHealth: "unknown",
    latestObservation: {
      source: "resource-access-summary",
      ...(deploymentId ? { deploymentId } : {}),
      ...("updatedAt" in input.route ? { observedAt: input.route.updatedAt } : {}),
    },
    ...(reason ? { blockingReason: reason } : {}),
    recommendedAction: recommendedAction(reason),
    copySafeSummary: {
      status: status === "ready" ? "available" : status,
      ...(reason ? { code: reason, phase: "route-status-observation" } : {}),
      message: reason
        ? "Route access is blocked by a typed observation state."
        : "Route access is available according to the latest route observation.",
    },
  };
}

export function routeIntentStatusDescriptors(input: {
  resourceId: string;
  accessSummary?: ResourceAccessSummary | undefined;
}): RouteIntentStatusDescriptor[] {
  const access = input.accessSummary;
  if (!access) {
    return [];
  }

  const descriptors: RouteIntentStatusDescriptor[] = [];
  if (access.latestDurableDomainRoute) {
    descriptors.push(
      descriptorFromRoute({
        resourceId: input.resourceId,
        source: "durable-domain-binding",
        route: access.latestDurableDomainRoute,
        proxyRouteStatus: access.proxyRouteStatus,
      }),
    );
  }
  if (access.latestServerAppliedDomainRoute) {
    descriptors.push(
      descriptorFromRoute({
        resourceId: input.resourceId,
        source: "server-applied-route",
        route: access.latestServerAppliedDomainRoute,
        proxyRouteStatus: access.proxyRouteStatus,
      }),
    );
  }
  if (access.latestGeneratedAccessRoute) {
    descriptors.push(
      descriptorFromRoute({
        resourceId: input.resourceId,
        source: "generated-default-access",
        route: access.latestGeneratedAccessRoute,
        proxyRouteStatus: access.proxyRouteStatus,
      }),
    );
  }
  if (access.plannedGeneratedAccessRoute) {
    descriptors.push(
      descriptorFromRoute({
        resourceId: input.resourceId,
        source: "generated-default-access",
        route: access.plannedGeneratedAccessRoute,
        proxyRouteStatus: access.proxyRouteStatus,
      }),
    );
  }

  return descriptors;
}

export function selectedRouteIntentStatus(input: {
  resourceId: string;
  accessSummary?: ResourceAccessSummary | undefined;
  domainBindings?: DomainBindingSummary[];
}): RouteIntentStatusDescriptor | undefined {
  const blockingDurable = input.domainBindings?.find(
    (binding) =>
      binding.status !== "ready" &&
      binding.proxyKind !== "none" &&
      !input.accessSummary?.latestDurableDomainRoute,
  );
  if (blockingDurable) {
    const scheme = blockingDurable.tlsMode === "auto" ? "https" : "http";
    const routeId = descriptorId({
      source: "durable-domain-binding",
      hostname: blockingDurable.domainName,
      pathPrefix: blockingDurable.pathPrefix,
      deploymentId: blockingDurable.id,
    });
    return {
      schemaVersion: "route-intent-status/v1",
      routeId,
      diagnosticId: routeId,
      source: "durable-domain-binding",
      intent: {
        host: blockingDurable.domainName,
        pathPrefix: blockingDurable.pathPrefix,
        protocol: scheme,
        routeBehavior: "serve",
      },
      context: {
        resourceId: input.resourceId,
        ...(blockingDurable.serverId ? { serverId: blockingDurable.serverId } : {}),
        ...(blockingDurable.destinationId ? { destinationId: blockingDurable.destinationId } : {}),
      },
      proxy: {
        intent: "required",
        applied: "not-ready",
      },
      domainVerification: "pending",
      tls: blockingDurable.tlsMode === "auto" ? "pending" : "disabled",
      runtimeHealth: "unknown",
      latestObservation: {
        source: "resource-access-summary",
      },
      blockingReason: "domain_not_verified",
      recommendedAction: "verify-domain",
      copySafeSummary: {
        status: "not-ready",
        code: "domain_not_verified",
        phase: "route-status-observation",
        message: "Durable domain route is selected but not ready.",
      },
    };
  }

  return routeIntentStatusDescriptors({
    resourceId: input.resourceId,
    accessSummary: input.accessSummary,
  })[0];
}
