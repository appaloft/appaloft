import { type SystemPluginWebExtension } from "@appaloft/contracts";
import { describe, expect, test } from "vitest";

import {
  connectionsConsoleSurface,
  findConnectionsConsoleExtension,
  readConnectionsConsoleExtensionMetadata,
} from "./connections-extension";

const connectionsExtension: SystemPluginWebExtension = {
  key: "example-connections",
  pluginName: "example",
  pluginDisplayName: "Example",
  title: "Connections",
  path: "/connections",
  placement: "navigation",
  target: "console-route",
  requiresAuth: true,
  metadata: {
    renderer: "console-page",
    connectionSurface: "connections",
    pageEndpoint: "/example/connections/page?path={pathname}&query={query}",
    catalogEndpoint: "/api/connections/catalog",
    categoriesEndpoint: "/api/connections/categories",
    dnsConnectPath: "/connections?category=dns",
  },
};

describe("Connections console extension surface", () => {
  test("[APP-CONN-015] discovers neutral Connections console extension metadata", () => {
    expect(findConnectionsConsoleExtension([connectionsExtension], "navigation")).toEqual(
      connectionsExtension,
    );
    expect(readConnectionsConsoleExtensionMetadata(connectionsExtension)).toEqual({
      renderer: "console-page",
      connectionSurface: connectionsConsoleSurface,
      pageEndpoint: "/example/connections/page?path={pathname}&query={query}",
      catalogEndpoint: "/api/connections/catalog",
      categoriesEndpoint: "/api/connections/categories",
      dnsConnectPath: "/connections?category=dns",
    });
  });

  test("[APP-CONN-015] ignores unrelated console-page extensions", () => {
    const unrelated: SystemPluginWebExtension = {
      ...connectionsExtension,
      key: "example-usage",
      metadata: {
        renderer: "console-page",
        pageEndpoint: "/example/usage/page",
      },
    };

    expect(findConnectionsConsoleExtension([unrelated])).toBeNull();
    expect(readConnectionsConsoleExtensionMetadata(unrelated)).toBeNull();
  });
});
