import {
  accessRouteUrl,
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
  target?: {
    kind: "server-backed" | "serverless-static-artifact";
    publicationId?: string;
    artifactId?: string;
    routeUrl?: string;
  };
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

export interface ResourceAccessSummaryProjectionOptions {
  activePreviewSourceFingerprints?: ReadonlySet<string>;
  previewEnvironment?: boolean;
}

export interface ResourceAccessSummaryDomainBinding {
  id: string;
  status: DomainBindingStatus;
  createdAt: string;
  domainName: string;
  pathPrefix: string;
  pathHandling?: "preserve" | "strip";
  proxyKind: EdgeProxyKind;
  tlsMode: TlsMode;
}

function deploymentSourceFingerprint(
  deployment: ResourceAccessSummaryDeployment,
): string | undefined {
  const metadata = deployment.runtimePlan.execution.metadata ?? {};

  return metadata["access.sourceFingerprint"] ?? metadata["context.sourceFingerprint"];
}

function isPreviewSourceFingerprint(sourceFingerprint: string): boolean {
  return sourceFingerprint.startsWith("source-fingerprint:v1:preview%3A");
}

function isCurrentPreviewDeployment(
  deployment: ResourceAccessSummaryDeployment,
  options: ResourceAccessSummaryProjectionOptions,
): boolean {
  if (!options.previewEnvironment) {
    return true;
  }

  const activePreviewSourceFingerprints = options.activePreviewSourceFingerprints;
  if (!activePreviewSourceFingerprints || activePreviewSourceFingerprints.size === 0) {
    return false;
  }

  const sourceFingerprint = deploymentSourceFingerprint(deployment);
  if (!sourceFingerprint) {
    return true;
  }

  return (
    !isPreviewSourceFingerprint(sourceFingerprint) ||
    activePreviewSourceFingerprints.has(sourceFingerprint)
  );
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
    case "cancel-requested":
      return "not-ready";
  }
}

function staticArtifactRouteFor(
  deployment: ResourceAccessSummaryDeployment,
): NonNullable<ResourceAccessSummary["latestStaticArtifactRoute"]> | undefined {
  if (deployment.target?.kind !== "serverless-static-artifact" || !deployment.target.routeUrl) {
    return undefined;
  }
  if (!deployment.target.publicationId || !deployment.target.artifactId) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(deployment.target.routeUrl);
  } catch {
    return undefined;
  }

  const scheme = parsed.protocol === "https:" ? "https" : "http";
  return {
    url: deployment.target.routeUrl,
    hostname: parsed.hostname,
    scheme,
    publicationId: deployment.target.publicationId ?? "",
    artifactId: deployment.target.artifactId ?? "",
    pathPrefix: parsed.pathname || "/",
    updatedAt: deployment.createdAt,
  };
}

export function projectResourceAccessSummary(
  deployments: ResourceAccessSummaryDeployment[],
  domainBindings: ResourceAccessSummaryDomainBinding[] = [],
  options: ResourceAccessSummaryProjectionOptions = {},
): ResourceAccessSummary | undefined {
  const sortedDeployments = deployments
    .filter((deployment) => isCurrentPreviewDeployment(deployment, options))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

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
  let latestDurableRoute: typeof latestRoute;
  let latestServerAppliedRoute: typeof latestRoute;
  let latestStaticArtifactRoute:
    | {
        deployment: ResourceAccessSummaryDeployment;
        route: NonNullable<ResourceAccessSummary["latestStaticArtifactRoute"]>;
      }
    | undefined;

  for (const deployment of sortedDeployments) {
    const metadata = deployment.runtimePlan.execution.metadata ?? {};
    const staticArtifactRoute = staticArtifactRouteFor(deployment);
    if (staticArtifactRoute) {
      latestStaticArtifactRoute ??= { deployment, route: staticArtifactRoute };
    }

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

    if (metadata["access.routeSource"] === "durable-domain-binding") {
      latestDurableRoute ??= { deployment, route, metadata };
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
    !latestStaticArtifactRoute &&
    !latestServerAppliedRoute &&
    (!readyDurableBinding || !latestRoute)
  ) {
    return undefined;
  }

  const summary: ResourceAccessSummary = {};

  if (latestStaticArtifactRoute) {
    summary.latestStaticArtifactRoute = latestStaticArtifactRoute.route;
  }

  if (latestGeneratedRoute) {
    const { deployment, metadata, route } = latestGeneratedRoute;

    const hostname = metadata["access.hostname"] ?? route.domains[0];
    if (hostname) {
      const scheme =
        metadata["access.scheme"] === "https" || route.tlsMode === "auto" ? "https" : "http";
      summary.latestGeneratedAccessRoute = {
        url: accessRouteUrl({ hostname, scheme, routePathPrefix: route.pathPrefix, metadata }),
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

  const durableRoute = latestDurableRoute ?? latestRoute;

  if (readyDurableBinding && durableRoute) {
    const { deployment, metadata, route } = durableRoute;
    const scheme = readyDurableBinding.tlsMode === "auto" ? "https" : "http";

    summary.latestDurableDomainRoute = {
      url: accessRouteUrl({
        hostname: readyDurableBinding.domainName,
        scheme,
        routePathPrefix: readyDurableBinding.pathPrefix,
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
        url: accessRouteUrl({ hostname, scheme, routePathPrefix: route.pathPrefix, metadata }),
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
    summary.latestDurableDomainRoute && durableRoute
      ? durableRoute.deployment
      : (latestServerAppliedRoute?.deployment ?? latestGeneratedRoute?.deployment);

  if (routeStatusDeployment) {
    summary.proxyRouteStatus = proxyRouteStatusFor(routeStatusDeployment.status);
    summary.lastRouteRealizationDeploymentId = routeStatusDeployment.id;
  }

  return Object.keys(summary).length > 0 ? summary : undefined;
}
