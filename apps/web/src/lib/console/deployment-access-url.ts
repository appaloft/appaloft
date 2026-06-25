import {
  accessRouteOpenPathPrefix,
  accessRouteUrl,
  type EdgeProxyKind,
  type TlsMode,
} from "@appaloft/core";

export type DeploymentAccessUrlKind = "deployment" | "domain" | "direct";
export interface DeploymentAccessUrl {
  readonly url: string;
  readonly kind: DeploymentAccessUrlKind;
}

export interface DeploymentAccessRoute {
  readonly domains: readonly string[];
  readonly pathPrefix: string;
  readonly proxyKind: EdgeProxyKind;
  readonly targetPort?: number;
  readonly tlsMode: TlsMode;
}

export interface DeploymentAccessUrlSource {
  readonly target?: {
    readonly kind: "server-backed" | "serverless-static-artifact";
    readonly routeUrl?: string;
  };
  readonly runtimePlan: {
    readonly execution: {
      readonly accessRoutes?: readonly DeploymentAccessRoute[];
      readonly metadata?: Readonly<Record<string, string>>;
      readonly port?: number;
    };
  };
}

function addUniqueAccessUrl(
  urls: DeploymentAccessUrl[],
  url: DeploymentAccessUrl,
): DeploymentAccessUrl[] {
  if (urls.some((existingUrl) => existingUrl.url === url.url)) {
    return urls;
  }

  return [...urls, url];
}

function accessUrlsForRoute(input: {
  readonly executionPort: number | undefined;
  readonly metadata: Readonly<Record<string, string>>;
  readonly route: DeploymentAccessRoute;
  readonly serverHost: string | undefined;
}): DeploymentAccessUrl[] {
  const { executionPort, metadata, route, serverHost } = input;

  if (route.domains.length > 0) {
    const scheme = route.tlsMode === "auto" ? "https" : "http";
    return route.domains.map((domain) => ({
      url: accessRouteUrl({
        hostname: domain,
        scheme,
        routePathPrefix: route.pathPrefix,
        metadata,
      }),
      kind: "domain" as const,
    }));
  }

  const directPort = route.targetPort ?? executionPort;
  if (route.proxyKind === "none" && serverHost && directPort) {
    const pathPrefix = accessRouteOpenPathPrefix({ routePathPrefix: route.pathPrefix, metadata });
    const path = pathPrefix === "/" ? "" : pathPrefix;
    return [
      {
        url: `http://${serverHost}:${directPort}${path}`,
        kind: "direct",
      },
    ];
  }

  return [];
}

export function deploymentAccessUrls(
  deployment: DeploymentAccessUrlSource,
  serverHost: string | undefined,
): DeploymentAccessUrl[] {
  const metadata = deployment.runtimePlan.execution.metadata ?? {};
  const metadataUrl = metadata.publicUrl ?? metadata.url ?? metadata["staticArtifact.routeUrl"];
  let urls: DeploymentAccessUrl[] = [];

  if (deployment.target?.kind === "serverless-static-artifact" && deployment.target.routeUrl) {
    urls = addUniqueAccessUrl(urls, {
      url: deployment.target.routeUrl,
      kind: "deployment",
    });
  }

  for (const route of deployment.runtimePlan.execution.accessRoutes ?? []) {
    for (const url of accessUrlsForRoute({
      executionPort: deployment.runtimePlan.execution.port,
      metadata,
      route,
      serverHost,
    })) {
      urls = addUniqueAccessUrl(urls, url);
    }
  }

  if (typeof metadataUrl === "string" && metadataUrl) {
    urls = addUniqueAccessUrl(urls, { url: metadataUrl, kind: "deployment" });
  }

  return urls;
}
