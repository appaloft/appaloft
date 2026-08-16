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

export interface OccupancyIdentity {
  readonly repositoryIdentity?: string;
  readonly commitSha?: string;
  readonly branch?: string;
}

export interface OccupancyPreviewEnvironment {
  readonly updatedAt?: string;
  readonly source?: {
    readonly repositoryFullName?: string;
    readonly headRepositoryFullName?: string;
    readonly pullRequestNumber?: number;
    readonly baseRef?: string;
    readonly headSha?: string;
  };
}

export interface OccupancyPullRequestChrome {
  readonly number: number;
}

function normalizeRepositoryIdentity(value: string): string {
  return value
    .trim()
    .replace(/^github\.com\//iu, "")
    .replace(/^gitlab\.com\//iu, "")
    .replace(/\.git$/u, "")
    .toLowerCase();
}

function previewEnvironmentMatchesOccupancy(
  environment: OccupancyPreviewEnvironment,
  occupancy: OccupancyIdentity,
): boolean {
  if (!occupancy.repositoryIdentity) return false;
  const repo = normalizeRepositoryIdentity(occupancy.repositoryIdentity);
  const source = environment.source;
  const candidates = [source?.repositoryFullName, source?.headRepositoryFullName]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .map(normalizeRepositoryIdentity);
  if (!candidates.includes(repo)) return false;
  if (occupancy.commitSha && typeof source?.headSha === "string" && source.headSha.length > 0) {
    return occupancy.commitSha.toLowerCase() === source.headSha.toLowerCase();
  }
  return true;
}

export function occupancyPullRequestFromPreviewEnvironments(
  environments: readonly OccupancyPreviewEnvironment[],
  occupancy: OccupancyIdentity | undefined,
): OccupancyPullRequestChrome | undefined {
  if (!occupancy?.repositoryIdentity) return undefined;
  let match: { readonly number: number; readonly updatedAt?: string } | undefined;
  for (const environment of environments) {
    const number = environment.source?.pullRequestNumber;
    if (typeof number !== "number" || !Number.isInteger(number) || number <= 0) continue;
    if (!previewEnvironmentMatchesOccupancy(environment, occupancy)) continue;
    if (
      !match ||
      (typeof environment.updatedAt === "string" &&
        (match.updatedAt === undefined || environment.updatedAt >= match.updatedAt))
    ) {
      match = { number, ...(environment.updatedAt ? { updatedAt: environment.updatedAt } : {}) };
    }
  }
  return match ? { number: match.number } : undefined;
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
