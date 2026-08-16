export interface OccupancyResource {
  readonly projectId?: string;
  readonly slug?: string;
  readonly lastDeploymentId?: string;
  readonly lastDeploymentStatus?: string;
  readonly accessSummary?: {
    readonly latestGeneratedAccessRoute?: {
      readonly url?: string;
      readonly deploymentStatus?: string;
    };
  };
}

export interface OccupancyPreviewChrome {
  readonly url: string;
}

export interface OccupancyDeploymentChrome {
  readonly id: string;
  readonly status?: string;
}

export interface OccupancyChrome {
  readonly preview?: OccupancyPreviewChrome;
  readonly deployment?: OccupancyDeploymentChrome;
}

export function occupancyPreviewFromResource(
  resource: OccupancyResource,
): OccupancyPreviewChrome | undefined {
  if (resource.slug !== "app") return undefined;
  const route = resource.accessSummary?.latestGeneratedAccessRoute;
  if (typeof route?.url !== "string" || route.url.length === 0) return undefined;
  if (route.deploymentStatus !== "succeeded" && resource.lastDeploymentStatus !== "succeeded") {
    return undefined;
  }
  return { url: route.url };
}

export function occupancyLastDeploymentFromResource(
  resource: OccupancyResource,
): OccupancyDeploymentChrome | undefined {
  if (resource.slug !== "app") return undefined;
  if (typeof resource.lastDeploymentId !== "string" || resource.lastDeploymentId.length === 0) {
    return undefined;
  }
  return {
    id: resource.lastDeploymentId,
    ...(typeof resource.lastDeploymentStatus === "string"
      ? { status: resource.lastDeploymentStatus }
      : {}),
  };
}

export function occupancyChromeForProject(
  resources: readonly OccupancyResource[],
  projectId: string | undefined,
): OccupancyChrome {
  if (!projectId) return {};
  let preview: OccupancyPreviewChrome | undefined;
  let deployment: OccupancyDeploymentChrome | undefined;
  for (const resource of resources) {
    if (resource.projectId !== projectId) continue;
    preview ??= occupancyPreviewFromResource(resource);
    deployment ??= occupancyLastDeploymentFromResource(resource);
    if (preview && deployment) break;
  }
  return {
    ...(preview ? { preview } : {}),
    ...(deployment ? { deployment } : {}),
  };
}
