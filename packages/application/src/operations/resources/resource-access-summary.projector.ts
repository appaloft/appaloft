import { type DeploymentStatus, type EdgeProxyKind, type TlsMode } from "@yundu/core";
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
): ResourceAccessSummary | undefined {
  const sortedDeployments = [...deployments].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );

  for (const deployment of sortedDeployments) {
    const metadata = deployment.runtimePlan.execution.metadata ?? {};
    const route = deployment.runtimePlan.execution.accessRoutes?.find(
      (candidate) => candidate.proxyKind !== "none" && candidate.domains.length > 0,
    );

    if (!route) {
      continue;
    }

    if (metadata["access.routeSource"] !== "generated-default") {
      continue;
    }

    const hostname = metadata["access.hostname"] ?? route.domains[0];
    if (!hostname) {
      continue;
    }

    const scheme =
      metadata["access.scheme"] === "https" || route.tlsMode === "auto" ? "https" : "http";

    return {
      latestGeneratedAccessRoute: {
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
      },
      proxyRouteStatus: proxyRouteStatusFor(deployment.status),
      lastRouteRealizationDeploymentId: deployment.id,
    };
  }

  return undefined;
}
