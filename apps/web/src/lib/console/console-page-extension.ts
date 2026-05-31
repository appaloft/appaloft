import { type SystemPluginWebExtension } from "@appaloft/contracts";

export const consolePageRenderer = "console-page" as const;

export interface ConsolePageExtensionMetadata {
  readonly renderer: typeof consolePageRenderer;
  readonly pageEndpoint: string;
}

export interface ConsolePageEndpointContext {
  readonly pathname: string;
  readonly query?: string;
  readonly organization?: {
    readonly organizationId?: string;
    readonly slug?: string;
    readonly name?: string;
    readonly role?: string;
  } | null;
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
  };

  return Object.entries(replacements).reduce(
    (endpoint, [key, value]) => endpoint.replaceAll(`{${key}}`, encodeURIComponent(value)),
    metadata.pageEndpoint,
  );
}

function normalizePath(path: string): string {
  if (!path) {
    return "/";
  }

  const withoutQuery = path.split("?")[0] ?? path;
  const normalized = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  return normalized.length > 1 && normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}
