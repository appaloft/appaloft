import {
  type DeploymentStatus,
  type DomainBindingStatus,
  type EdgeProxyKind,
  type TlsMode,
} from "@appaloft/core";
import { type ResourceAccessSummary } from "../../ports";

export interface ResourceAccessSummaryDeployment {
  id: string;
  status: DeploymentStatus;
  createdAt: string;
  runtimePlan: {
    execution: {
      accessRoutes?: Array<{
        proxyKind: EdgeProxyKind;
        domains: string[];
        pathPrefix: string;
        tlsMode: TlsMode;
        targetPort?: number;
      }>;
      metadata?: Record<string, string>;
    };
  };
}

export interface ResourceAccessSummaryDomainBinding {
  id: string;
  status: DomainBindingStatus;
  createdAt: string;
  domainName: string;
  pathPrefix: string;
  proxyKind: EdgeProxyKind;
  tlsMode: TlsMode;
}

function routeUrl(input: {
  hostname: string;
  scheme: "http" | "https";
  pathPrefix: string;
}): string {
  const path = input.pathPrefix === "/" ? "" : input.pathPrefix;
  return `${input.scheme}://${input.hostname}${path}`;
}

function proxyRouteStatusFor(
  deploymentStatus: DeploymentStatus,
): NonNullable<ResourceAccessSummary["proxyRouteStatus"]> {
  switch (deploymentStatus) {
    case "succeeded":
    case "rolled-back":
      return "ready";
    case "failed":
    case "canceled":
      return "failed";
    case "created":
    case "planning":
    case "planned":
    case "running":
      return "not-ready";
  }
}

export function projectResourceAccessSummary(
  deployments: ResourceAccessSummaryDeployment[],
  domainBindings: ResourceAccessSummaryDomainBinding[] = [],
): ResourceAccessSummary | undefined {
  const sortedDeployments = [...deployments].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );

  let latestRoute:
    | {
        deployment: ResourceAccessSummaryDeployment;
        route: NonNullable<
          ResourceAccessSummaryDeployment["runtimePlan"]["execution"]["accessRoutes"]
        >[number];
        metadata: Record<string, string>;
      }
    | undefined;
  let latestGeneratedRoute: typeof latestRoute;
  let latestServerAppliedRoute: typeof latestRoute;

  for (const deployment of sortedDeployments) {
    const metadata = deployment.runtimePlan.execution.metadata ?? {};
    const route = deployment.runtimePlan.execution.accessRoutes?.find(
      (candidate) => candidate.proxyKind !== "none" && candidate.domains.length > 0,
    );

    if (!route) {
      continue;
    }

    latestRoute ??= { deployment, route, metadata };

    if (metadata["access.routeSource"] === "generated-default") {
      latestGeneratedRoute ??= { deployment, route, metadata };
    }

    if (metadata["access.routeSource"] === "server-applied-config-domain") {
      latestServerAppliedRoute ??= { deployment, route, metadata };
    }
  }

  const readyDurableBinding = [...domainBindings]
    .filter((binding) => binding.status === "ready" && binding.proxyKind !== "none")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

  if (
    !latestGeneratedRoute &&
    !latestServerAppliedRoute &&
    (!readyDurableBinding || !latestRoute)
  ) {
    return undefined;
  }

  const summary: ResourceAccessSummary = {};

  if (latestGeneratedRoute) {
    const { deployment, metadata, route } = latestGeneratedRoute;

    const hostname = metadata["access.hostname"] ?? route.domains[0];
    if (hostname) {
      const scheme =
        metadata["access.scheme"] === "https" || route.tlsMode === "auto" ? "https" : "http";

      summary.latestGeneratedAccessRoute = {
        url: routeUrl({ hostname, scheme, pathPrefix: route.pathPrefix }),
        hostname,
        scheme,
        ...(metadata["access.providerKey"] ? { providerKey: metadata["access.providerKey"] } : {}),
        deploymentId: deployment.id,
        deploymentStatus: deployment.status,
        pathPrefix: route.pathPrefix,
        proxyKind: route.proxyKind,
        ...(typeof route.targetPort === "number" ? { targetPort: route.targetPort } : {}),
        updatedAt: deployment.createdAt,
      };
    }
  }

  if (readyDurableBinding && latestRoute) {
    const { deployment, metadata, route } = latestRoute;
    const scheme = readyDurableBinding.tlsMode === "auto" ? "https" : "http";

    summary.latestDurableDomainRoute = {
      url: routeUrl({
        hostname: readyDurableBinding.domainName,
        scheme,
        pathPrefix: readyDurableBinding.pathPrefix,
      }),
      hostname: readyDurableBinding.domainName,
      scheme,
      ...(metadata["access.providerKey"] ? { providerKey: metadata["access.providerKey"] } : {}),
      deploymentId: deployment.id,
      deploymentStatus: deployment.status,
      pathPrefix: readyDurableBinding.pathPrefix,
      proxyKind: readyDurableBinding.proxyKind,
      ...(typeof route.targetPort === "number" ? { targetPort: route.targetPort } : {}),
      updatedAt: readyDurableBinding.createdAt,
    };
  }

  if (latestServerAppliedRoute) {
    const { deployment, metadata, route } = latestServerAppliedRoute;
    const hostname = metadata["access.hostname"] ?? route.domains[0];

    if (hostname) {
      const scheme =
        metadata["access.scheme"] === "https" || route.tlsMode === "auto" ? "https" : "http";

      summary.latestServerAppliedDomainRoute = {
        url: routeUrl({ hostname, scheme, pathPrefix: route.pathPrefix }),
        hostname,
        scheme,
        ...(metadata["access.providerKey"] ? { providerKey: metadata["access.providerKey"] } : {}),
        deploymentId: deployment.id,
        deploymentStatus: deployment.status,
        pathPrefix: route.pathPrefix,
        proxyKind: route.proxyKind,
        ...(typeof route.targetPort === "number" ? { targetPort: route.targetPort } : {}),
        updatedAt: deployment.createdAt,
      };
    }
  }

  const routeStatusDeployment =
    summary.latestDurableDomainRoute && latestRoute
      ? latestRoute.deployment
      : (latestServerAppliedRoute?.deployment ?? latestGeneratedRoute?.deployment);

  if (routeStatusDeployment) {
    summary.proxyRouteStatus = proxyRouteStatusFor(routeStatusDeployment.status);
    summary.lastRouteRealizationDeploymentId = routeStatusDeployment.id;
  }

  return Object.keys(summary).length > 0 ? summary : undefined;
}
