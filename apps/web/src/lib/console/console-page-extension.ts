import { type SystemPluginWebExtension } from "@appaloft/contracts";

export const consolePageRenderer = "console-page" as const;

export interface ConsolePageExtensionMetadata {
  readonly renderer: typeof consolePageRenderer;
  readonly pageEndpoint: string;
}

export type ConsolePageExtensionVisibilityMap = Record<string, boolean>;

export interface ConsolePageEndpointContext {
  readonly pathname: string;
  readonly query?: string;
  readonly organization?: {
    readonly organizationId?: string;
    readonly slug?: string;
    readonly name?: string;
    readonly role?: string;
  } | null;
  readonly projectId?: string;
  readonly environmentId?: string;
  readonly resourceId?: string;
  readonly deploymentId?: string;
  readonly previewEnvironmentId?: string;
}

export function findConsolePageExtensionByPath(
  extensions: readonly SystemPluginWebExtension[],
  pathname: string,
): SystemPluginWebExtension | null {
  const normalizedPathname = normalizePath(pathname);
  return (
    extensions
      .filter((extension) => {
        const extensionPath = normalizePath(extension.path);
        return (
          extension.target === "console-route" &&
          (extensionPath === normalizedPathname ||
            (extensionPath !== "/" && normalizedPathname.startsWith(`${extensionPath}/`))) &&
          readConsolePageExtensionMetadata(extension) !== null
        );
      })
      .sort(
        (left, right) => normalizePath(right.path).length - normalizePath(left.path).length,
      )[0] ?? null
  );
}

export function readConsolePageExtensionMetadata(
  extension: SystemPluginWebExtension | null | undefined,
): ConsolePageExtensionMetadata | null {
  const metadata = extension?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  if (metadata.renderer !== consolePageRenderer || typeof metadata.pageEndpoint !== "string") {
    return null;
  }

  return {
    renderer: consolePageRenderer,
    pageEndpoint: metadata.pageEndpoint,
  };
}

export function findConsolePanelExtensionsByPlacement(
  extensions: readonly SystemPluginWebExtension[],
  placement: SystemPluginWebExtension["placement"],
): SystemPluginWebExtension[] {
  return extensions.filter(
    (extension) =>
      extension.target === "console-route" &&
      extension.placement === placement &&
      readConsolePageExtensionMetadata(extension) !== null,
  );
}

export function resolveConsolePageEndpoint(
  metadata: ConsolePageExtensionMetadata | null | undefined,
  context: ConsolePageEndpointContext,
): string | null {
  if (!metadata) {
    return null;
  }

  const replacements: Record<string, string> = {
    pathname: context.pathname,
    query: context.query ?? "",
    organizationId: context.organization?.organizationId ?? "",
    organizationSlug: context.organization?.slug ?? "",
    organizationName: context.organization?.name ?? "",
    organizationRole: context.organization?.role ?? "",
    projectId: context.projectId ?? "",
    environmentId: context.environmentId ?? "",
    resourceId: context.resourceId ?? "",
    deploymentId: context.deploymentId ?? "",
    previewEnvironmentId: context.previewEnvironmentId ?? "",
  };

  return Object.entries(replacements).reduce(
    (endpoint, [key, value]) => endpoint.replaceAll(`{${key}}`, encodeURIComponent(value)),
    metadata.pageEndpoint,
  );
}

export function readConsolePageExtensionVisibilityEndpoint(
  extension: SystemPluginWebExtension | null | undefined,
): string | null {
  const metadata = extension?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const endpoint = metadata.visibilityEndpoint;
  return typeof endpoint === "string" && endpoint.length > 0 ? endpoint : null;
}

export function resolveConsolePageVisibilityEndpoint(
  extension: SystemPluginWebExtension | null | undefined,
  context: ConsolePageEndpointContext,
): string | null {
  const endpoint = readConsolePageExtensionVisibilityEndpoint(extension);
  if (!endpoint) {
    return null;
  }

  const replacements: Record<string, string> = {
    pathname: context.pathname,
    query: context.query ?? "",
    organizationId: context.organization?.organizationId ?? "",
    organizationSlug: context.organization?.slug ?? "",
    organizationName: context.organization?.name ?? "",
    organizationRole: context.organization?.role ?? "",
    projectId: context.projectId ?? "",
    environmentId: context.environmentId ?? "",
    resourceId: context.resourceId ?? "",
    deploymentId: context.deploymentId ?? "",
    previewEnvironmentId: context.previewEnvironmentId ?? "",
  };

  return Object.entries(replacements).reduce(
    (resolved, [key, value]) => resolved.replaceAll(`{${key}}`, encodeURIComponent(value)),
    endpoint,
  );
}

export function isConsolePageExtensionVisible(
  extension: SystemPluginWebExtension | null | undefined,
  visibility: ConsolePageExtensionVisibilityMap,
): boolean {
  if (!extension) {
    return false;
  }
  if (!readConsolePageExtensionVisibilityEndpoint(extension)) {
    return true;
  }
  return visibility[extension.key] === true;
}

function normalizePath(path: string): string {
  if (!path) {
    return "/";
  }

  const withoutQuery = path.split("?")[0] ?? path;
  const normalized = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  return normalized.length > 1 && normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}
