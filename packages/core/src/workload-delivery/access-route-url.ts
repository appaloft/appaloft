import { RoutePathPrefix } from "../shared/text-values";

export const accessDefaultOpenPathPrefixMetadataKey = "access.defaultOpenPathPrefix";
export const deploymentRouteIdentityHeaderName = "X-Appaloft-Deployment-Id";

export interface AccessRouteOpenPathPrefixInput {
  readonly metadata?: Readonly<Record<string, string>>;
  readonly routePathPrefix: string;
}

export interface AccessRouteUrlInput extends AccessRouteOpenPathPrefixInput {
  readonly hostname: string;
  readonly scheme: "http" | "https";
}

export function normalizeAccessRoutePathPrefix(pathPrefix: string): string {
  const normalized = RoutePathPrefix.create(pathPrefix || "/");
  if (normalized.isOk()) {
    return normalized.value.value;
  }

  return pathPrefix.startsWith("/") ? pathPrefix : `/${pathPrefix}`;
}

export function accessRouteOpenPathPrefix(input: AccessRouteOpenPathPrefixInput): string {
  const routePathPrefix = normalizeAccessRoutePathPrefix(input.routePathPrefix);
  const candidate = input.metadata?.[accessDefaultOpenPathPrefixMetadataKey]?.trim();
  if (!candidate) {
    return routePathPrefix;
  }

  const openPathPrefix = RoutePathPrefix.create(candidate);
  if (openPathPrefix.isErr()) {
    return routePathPrefix;
  }

  const openPath = openPathPrefix.value.value;
  if (routePathPrefix === "/") {
    return openPath;
  }

  const routePath = routePathPrefix.endsWith("/") ? routePathPrefix : `${routePathPrefix}/`;
  return openPath === routePathPrefix || openPath.startsWith(routePath)
    ? openPath
    : routePathPrefix;
}

export function accessRouteUrl(input: AccessRouteUrlInput): string {
  const pathPrefix = accessRouteOpenPathPrefix(input);
  const path = pathPrefix === "/" ? "" : pathPrefix;
  return `${input.scheme}://${input.hostname}${path}`;
}
