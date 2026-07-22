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

function isDomainVerificationPending(binding: DomainBindingSummary): boolean {
  return binding.status === "requested" || binding.status === "pending_verification";
}

function descriptorFromRoute(input: {
  resourceId: string;
  source: RouteIntentStatusDescriptor["source"];
  route: AccessRoute;
  proxyRouteStatus?: ResourceAccessSummary["proxyRouteStatus"];
  domainBinding?: DomainBindingSummary;
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
  const routeBehavior =
    input.domainBinding?.redirectTo || input.route.redirectTo
      ? "redirect"
      : ((input.domainBinding ? undefined : input.route.routeBehavior) ?? "serve");
  const redirectTo = input.domainBinding?.redirectTo ?? input.route.redirectTo;
  const redirectStatus = input.domainBinding?.redirectStatus ?? input.route.redirectStatus;

  return {
    schemaVersion: "route-intent-status/v1",
    routeId,
    diagnosticId: routeId,
    source: input.source,
    intent: {
      host: input.route.hostname,
      pathPrefix: input.route.pathPrefix,
      protocol: input.route.scheme,
      routeBehavior,
      ...(redirectTo ? { redirectTo } : {}),
      ...(redirectStatus ? { redirectStatus } : {}),
    },
    context: {
      resourceId: input.resourceId,
      ...(deploymentId ? { deploymentId } : {}),
      ...(input.domainBinding?.serverId ? { serverId: input.domainBinding.serverId } : {}),
      ...(input.domainBinding?.destinationId
        ? { destinationId: input.domainBinding.destinationId }
        : {}),
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
  domainBindings?: DomainBindingSummary[];
}): RouteIntentStatusDescriptor[] {
  const access = input.accessSummary;
  if (!access) {
    return [];
  }

  const descriptors: RouteIntentStatusDescriptor[] = [];
  if (access.latestDurableDomainRoute) {
    const domainBinding = input.domainBindings?.find(
      (binding) =>
        binding.status !== "deleted" &&
        binding.domainName === access.latestDurableDomainRoute?.hostname &&
        binding.pathPrefix === access.latestDurableDomainRoute.pathPrefix,
    );
    descriptors.push(
      descriptorFromRoute({
        resourceId: input.resourceId,
        source: "durable-domain-binding",
        route: access.latestDurableDomainRoute,
        proxyRouteStatus: access.proxyRouteStatus,
        ...(domainBinding ? { domainBinding } : {}),
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
    const domainVerificationPending = isDomainVerificationPending(blockingDurable);
    const reason = domainVerificationPending ? "domain_not_verified" : "proxy_route_missing";
    const action = recommendedAction(reason);
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
        routeBehavior: blockingDurable.redirectTo ? "redirect" : "serve",
        ...(blockingDurable.redirectTo ? { redirectTo: blockingDurable.redirectTo } : {}),
        ...(blockingDurable.redirectStatus
          ? { redirectStatus: blockingDurable.redirectStatus }
          : {}),
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
      domainVerification: domainVerificationPending ? "pending" : "verified",
      tls: blockingDurable.tlsMode === "auto" ? "pending" : "disabled",
      runtimeHealth: "unknown",
      latestObservation: {
        source: "resource-access-summary",
      },
      blockingReason: reason,
      recommendedAction: action,
      copySafeSummary: {
        status: "not-ready",
        code: reason,
        phase: "route-status-observation",
        message: "Durable domain route is selected but not ready.",
      },
    };
  }

  return routeIntentStatusDescriptors({
    resourceId: input.resourceId,
    ...(input.accessSummary ? { accessSummary: input.accessSummary } : {}),
    ...(input.domainBindings ? { domainBindings: input.domainBindings } : {}),
  })[0];
}
