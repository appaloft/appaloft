import { type SystemPluginWebExtension } from "@appaloft/contracts";

import { consolePageRenderer } from "./console-page-extension";

export const connectionsConsoleSurface = "connections" as const;

export interface ConnectionsConsoleExtensionMetadata {
  readonly renderer: typeof consolePageRenderer;
  readonly connectionSurface: typeof connectionsConsoleSurface;
  readonly pageEndpoint: string;
  readonly catalogEndpoint: string;
  readonly categoriesEndpoint: string;
  readonly dnsConnectPath?: string;
}

export function findConnectionsConsoleExtension(
  extensions: readonly SystemPluginWebExtension[],
  placement: SystemPluginWebExtension["placement"] = "settings",
): SystemPluginWebExtension | null {
  return (
    extensions.find(
      (extension) =>
        extension.placement === placement && readConnectionsConsoleExtensionMetadata(extension),
    ) ?? null
  );
}

export function readConnectionsConsoleExtensionMetadata(
  extension: SystemPluginWebExtension | null | undefined,
): ConnectionsConsoleExtensionMetadata | null {
  const metadata = extension?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  if (
    metadata.renderer !== consolePageRenderer ||
    metadata.connectionSurface !== connectionsConsoleSurface ||
    typeof metadata.pageEndpoint !== "string" ||
    typeof metadata.catalogEndpoint !== "string" ||
    typeof metadata.categoriesEndpoint !== "string"
  ) {
    return null;
  }

  return {
    renderer: consolePageRenderer,
    connectionSurface: connectionsConsoleSurface,
    pageEndpoint: metadata.pageEndpoint,
    catalogEndpoint: metadata.catalogEndpoint,
    categoriesEndpoint: metadata.categoriesEndpoint,
    ...(typeof metadata.dnsConnectPath === "string"
      ? { dnsConnectPath: metadata.dnsConnectPath }
      : {}),
  };
}
