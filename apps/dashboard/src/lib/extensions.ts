import type {
  SystemPluginWebExtension,
  SystemPluginWebExtensionScopedNavigation,
} from "@appaloft/contracts";

import type { DashboardRoute } from "./navigation";

export interface ConsoleExtensionPageDocumentV1 {
  readonly schemaVersion: "appaloft.console.extension-page/v1";
  readonly title: string;
  readonly description?: string;
  readonly badge?: string;
  readonly actions?: readonly Record<string, unknown>[];
  readonly sections: readonly Record<string, unknown>[];
}

export interface ActiveScopedExtension {
  readonly extension: SystemPluginWebExtension;
  readonly navigation: SystemPluginWebExtensionScopedNavigation;
  readonly pageEndpoint?: string;
  readonly visibilityEndpoint?: string;
  readonly route: string;
}

function routeScope(route: DashboardRoute): {
  scope: SystemPluginWebExtensionScopedNavigation["scope"];
  destination: string;
} | null {
  if (route.kind === "workspace" || route.kind === "project" || route.kind === "resource") {
    return { scope: route.kind, destination: route.destination };
  }

  return null;
}

function isScopedNavigation(value: unknown): value is SystemPluginWebExtensionScopedNavigation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.scope === "workspace" ||
      candidate.scope === "project" ||
      candidate.scope === "resource") &&
    typeof candidate.destination === "string" &&
    (candidate.presentation === "page" ||
      candidate.presentation === "section" ||
      candidate.presentation === "action") &&
    typeof candidate.key === "string" &&
    typeof candidate.labelKey === "string" &&
    typeof candidate.iconKey === "string" &&
    typeof candidate.order === "number" &&
    typeof candidate.routeTemplate === "string"
  );
}

export function readScopedNavigation(
  extension: SystemPluginWebExtension,
): SystemPluginWebExtensionScopedNavigation | null {
  const navigation = extension.metadata?.scopedNavigation;
  return isScopedNavigation(navigation) ? navigation : null;
}

function endpointMetadata(extension: SystemPluginWebExtension): {
  pageEndpoint?: string;
  visibilityEndpoint?: string;
} {
  const metadata = extension.metadata;
  const pageEndpoint =
    metadata?.renderer === "console-page" && typeof metadata.pageEndpoint === "string"
      ? metadata.pageEndpoint
      : undefined;
  const navigation = readScopedNavigation(extension);
  return {
    ...(pageEndpoint ? { pageEndpoint } : {}),
    ...(navigation?.visibilityEndpoint
      ? { visibilityEndpoint: navigation.visibilityEndpoint }
      : {}),
  };
}

export function resolveDashboardExtensionTemplate(template: string, route: DashboardRoute): string {
  const replacements: Record<string, string> = {
    pathname: typeof location === "undefined" ? "" : `${location.pathname}${location.search}`,
    query: typeof location === "undefined" ? "" : location.search.slice(1),
    projectId: route.kind === "project" || route.kind === "resource" ? route.projectId : "",
    environmentId:
      route.kind === "project" || route.kind === "resource" ? route.environmentId || "" : "",
    resourceId: route.kind === "resource" ? route.resourceId : "",
    destination:
      route.kind === "workspace" || route.kind === "project" || route.kind === "resource"
        ? route.destination
        : "",
  };

  return Object.entries(replacements).reduce(
    (resolved, [key, value]) => resolved.replaceAll(`{${key}}`, encodeURIComponent(value)),
    template,
  );
}

export function activeScopedExtensions(
  extensions: readonly SystemPluginWebExtension[],
  route: DashboardRoute,
): ActiveScopedExtension[] {
  const active = routeScope(route);
  if (!active) return [];

  return extensions
    .flatMap((extension) => {
      const navigation = readScopedNavigation(extension);
      if (
        extension.target !== "console-route" ||
        !navigation ||
        navigation.scope !== active.scope ||
        navigation.destination !== active.destination
      ) {
        return [];
      }

      const endpoints = endpointMetadata(extension);
      return [
        {
          extension,
          navigation,
          route: resolveDashboardExtensionTemplate(navigation.routeTemplate, route),
          ...(endpoints.pageEndpoint
            ? {
                pageEndpoint: resolveDashboardExtensionTemplate(endpoints.pageEndpoint, route),
              }
            : {}),
          ...(endpoints.visibilityEndpoint
            ? {
                visibilityEndpoint: resolveDashboardExtensionTemplate(
                  endpoints.visibilityEndpoint,
                  route,
                ),
              }
            : {}),
        },
      ];
    })
    .toSorted(
      (left, right) =>
        left.navigation.order - right.navigation.order ||
        left.navigation.key.localeCompare(right.navigation.key),
    );
}

export function isConsoleExtensionPageDocumentV1(
  value: unknown,
): value is ConsoleExtensionPageDocumentV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const document = value as Record<string, unknown>;
  return (
    document.schemaVersion === "appaloft.console.extension-page/v1" &&
    typeof document.title === "string" &&
    Array.isArray(document.sections)
  );
}
