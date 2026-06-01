import { readFileSync } from "node:fs";
import { type SystemPluginWebExtension } from "@appaloft/contracts";
import { describe, expect, test } from "vitest";

import {
  consolePageRenderer,
  findConsolePageExtensionByPath,
  readConsolePageExtensionMetadata,
  resolveConsolePageEndpoint,
} from "./console-page-extension";

const consolePageExtension: SystemPluginWebExtension = {
  key: "example-console-page",
  pluginName: "example",
  pluginDisplayName: "Example",
  title: "Usage",
  path: "/usage",
  placement: "settings",
  target: "console-route",
  requiresAuth: true,
  metadata: {
    renderer: consolePageRenderer,
    pageEndpoint:
      "/example/usage-page?organizationId={organizationId}&path={pathname}&query={query}",
  },
};

describe("Console page extension surface", () => {
  test("[CONSOLE-EXT-PAGE-001] discovers neutral console page extension metadata by route", () => {
    expect(findConsolePageExtensionByPath([consolePageExtension], "/usage")).toEqual(
      consolePageExtension,
    );
    expect(findConsolePageExtensionByPath([consolePageExtension], "/usage/")).toEqual(
      consolePageExtension,
    );
    expect(findConsolePageExtensionByPath([consolePageExtension], "/usage/details")).toEqual(
      consolePageExtension,
    );
    expect(readConsolePageExtensionMetadata(consolePageExtension)).toEqual({
      renderer: "console-page",
      pageEndpoint:
        "/example/usage-page?organizationId={organizationId}&path={pathname}&query={query}",
    });
    expect(findConsolePageExtensionByPath([consolePageExtension], "/other")).toBeNull();
  });

  test("[CONSOLE-EXT-PAGE-001] resolves organization template variables without exposing private code", () => {
    const metadata = readConsolePageExtensionMetadata(consolePageExtension);

    expect(
      resolveConsolePageEndpoint(metadata, {
        pathname: "/usage",
        query: "range=30d&type=debit",
        organization: {
          organizationId: "org_123",
          slug: "acme-team",
          name: "Acme Team",
          role: "billing",
        },
      }),
    ).toBe(
      "/example/usage-page?organizationId=org_123&path=%2Fusage&query=range%3D30d%26type%3Ddebit",
    );
  });

  test("[CONSOLE-EXT-PAGE-002] renderer supports neutral panel fields and request body bindings", () => {
    const rendererSource = readFileSync(
      new URL("../components/console/ConsoleExtensionPage.svelte", import.meta.url),
      "utf8",
    );

    expect(rendererSource).toContain('type: "number" | "range" | "range-number"');
    expect(rendererSource).toContain("data-console-page-panel-field");
    expect(rendererSource).toContain("fieldBindings?: Record<string, string>");
    expect(rendererSource).toContain("requestActionBody(action, item)");
    expect(rendererSource).toContain('kind: "tiered-unit-rate"');
    expect(rendererSource).toContain('import { goto } from "$app/navigation";');
    expect(rendererSource).toContain("placeholderData: (previousData) => previousData");
    expect(rendererSource).toContain("navigateConsolePageHref(filter.href)");
    expect(rendererSource).toContain("noScroll: true");
    expect(rendererSource).not.toContain("href={filter.href}");
  });
});
