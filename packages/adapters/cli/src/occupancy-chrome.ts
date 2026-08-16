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
    readonly latestDurableDomainRoute?: {
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
  readonly production?: OccupancyPreviewChrome;
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
  readonly url?: string;
}

function normalizeRepositoryIdentity(value: string): string {
  return value
    .trim()
    .replace(/^github\.com\//iu, "")
    .replace(/^gitlab\.com\//iu, "")
    .replace(/\.git$/u, "")
    .toLowerCase();
}

export function occupancyGitHubPullRequestUrl(
  occupancy: OccupancyIdentity | undefined,
  pullRequestNumber: number,
): string | undefined {
  if (!occupancy?.repositoryIdentity || pullRequestNumber <= 0) return undefined;
  const identity = occupancy.repositoryIdentity.trim();
  const github = identity.match(/^github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/u);
  if (!github) return undefined;
  return `https://github.com/${github[1]}/pull/${pullRequestNumber}`;
}

export function isOccupancyGitHubPullRequestUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return false;
    if (parsed.hostname !== "github.com") return false;
    return /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9][0-9]*$/u.test(parsed.pathname);
  } catch {
    return false;
  }
}

const occupancyGitHubBranchPattern = /^[A-Za-z0-9_./-]+$/u;

export function occupancyGitHubCompareUrl(
  occupancy: OccupancyIdentity | undefined,
): string | undefined {
  const branch = occupancy?.branch?.trim();
  if (!occupancy?.repositoryIdentity || !branch || !occupancyGitHubBranchPattern.test(branch)) {
    return undefined;
  }
  const identity = occupancy.repositoryIdentity.trim();
  const github = identity.match(/^github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/u);
  if (!github) return undefined;
  return `https://github.com/${github[1]}/compare/${branch}?expand=1`;
}

export function isOccupancyGitHubCompareUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password || parsed.hash) return false;
    if (parsed.hostname !== "github.com") return false;
    if (parsed.search !== "?expand=1") return false;
    return /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/compare\/[A-Za-z0-9_./-]+$/u.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function occupancyCompareOrPullUrl(
  occupancy: OccupancyIdentity | undefined,
  pullRequestUrl: string | undefined,
): string | undefined {
  if (pullRequestUrl && isOccupancyGitHubPullRequestUrl(pullRequestUrl)) return pullRequestUrl;
  const compare = occupancyGitHubCompareUrl(occupancy);
  return compare && isOccupancyGitHubCompareUrl(compare) ? compare : undefined;
}

export function isOccupancyHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    return parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

export function occupancyBrowserLaunchAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["APPALOFT_CLI_OPEN_BROWSER"] !== "false" && env["CI"] !== "true";
}

export type OccupancyCodeOpenTarget = "auto" | "preview" | "production" | "pr" | "compare";

export function occupancyCodeOpenUrl(input: {
  readonly previewUrl?: string;
  readonly productionUrl?: string;
  readonly pullRequestNumber?: number;
  readonly repositoryIdentity: string;
  readonly commitSha: string;
  readonly branch?: string;
  readonly target?: OccupancyCodeOpenTarget;
}): string | undefined {
  const target = input.target ?? "auto";
  const preview = input.previewUrl?.trim();
  const previewUrl = preview && isOccupancyHttpUrl(preview) ? preview : undefined;
  const production = input.productionUrl?.trim();
  const productionUrl = production && isOccupancyHttpUrl(production) ? production : undefined;
  const pull =
    typeof input.pullRequestNumber === "number" &&
    Number.isInteger(input.pullRequestNumber) &&
    input.pullRequestNumber > 0
      ? occupancyGitHubPullRequestUrl(
          {
            repositoryIdentity: input.repositoryIdentity,
            commitSha: input.commitSha,
          },
          input.pullRequestNumber,
        )
      : undefined;
  const compare = occupancyGitHubCompareUrl({
    repositoryIdentity: input.repositoryIdentity,
    commitSha: input.commitSha,
    ...(input.branch ? { branch: input.branch } : {}),
  });
  if (target === "preview") return previewUrl;
  if (target === "production") return productionUrl;
  if (target === "pr") return pull;
  if (target === "compare") return compare;
  return previewUrl ?? pull ?? compare;
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
  if (!match) return undefined;
  const url = occupancyGitHubPullRequestUrl(occupancy, match.number);
  return { number: match.number, ...(url ? { url } : {}) };
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

export function occupancyProductionFromResource(
  resource: OccupancyResource,
): OccupancyPreviewChrome | undefined {
  if (resource.slug !== "app") return undefined;
  const route = resource.accessSummary?.latestDurableDomainRoute;
  if (typeof route?.url !== "string" || route.url.length === 0) return undefined;
  if (route.deploymentStatus && route.deploymentStatus !== "succeeded") return undefined;
  return { url: route.url };
}

export function occupancyChromeForProject(
  resources: readonly OccupancyResource[],
  projectId: string | undefined,
): OccupancyChrome {
  if (!projectId) return {};
  let preview: OccupancyPreviewChrome | undefined;
  let production: OccupancyPreviewChrome | undefined;
  let deployment: OccupancyDeploymentChrome | undefined;
  for (const resource of resources) {
    if (resource.projectId !== projectId) continue;
    preview ??= occupancyPreviewFromResource(resource);
    production ??= occupancyProductionFromResource(resource);
    deployment ??= occupancyLastDeploymentFromResource(resource);
    if (preview && production && deployment) break;
  }
  return {
    ...(preview ? { preview } : {}),
    ...(production ? { production } : {}),
    ...(deployment ? { deployment } : {}),
  };
}
