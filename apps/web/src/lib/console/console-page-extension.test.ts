import { readFileSync } from "node:fs";
import { type SystemPluginWebExtension } from "@appaloft/contracts";
import { describe, expect, test } from "vitest";

import {
  consolePageRenderer,
  findConsolePageExtensionByPath,
  findConsolePanelExtensionsByPlacement,
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

const resourcePanelExtension: SystemPluginWebExtension = {
  ...consolePageExtension,
  key: "example-resource-panel",
  title: "Resource panel",
  path: "/resources",
  placement: "resource-detail-panel",
  metadata: {
    renderer: consolePageRenderer,
    pageEndpoint:
      "/example/resource-panel?projectId={projectId}&environmentId={environmentId}&resourceId={resourceId}",
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

  test("[CONSOLE-EXT-PAGE-003] resolves owner-scoped console panel template variables", () => {
    const metadata = readConsolePageExtensionMetadata(resourcePanelExtension);

    expect(
      resolveConsolePageEndpoint(metadata, {
        pathname: "/resources/res_123",
        query: "tab=dependencies",
        organization: {
          organizationId: "org_123",
          slug: "acme-team",
        },
        projectId: "proj_123",
        environmentId: "env_staging",
        resourceId: "res_123",
      }),
    ).toBe(
      "/example/resource-panel?projectId=proj_123&environmentId=env_staging&resourceId=res_123",
    );
  });

  test("[CONSOLE-EXT-PAGE-003] discovers console panel extensions by placement", () => {
    expect(
      findConsolePanelExtensionsByPlacement(
        [consolePageExtension, resourcePanelExtension],
        "resource-detail-panel",
      ),
    ).toEqual([resourcePanelExtension]);
    expect(
      findConsolePanelExtensionsByPlacement(
        [consolePageExtension, resourcePanelExtension],
        "project-environment-panel",
      ),
    ).toEqual([]);
  });

  test("[CONSOLE-EXT-PAGE-002] renderer supports neutral panel fields and request body bindings", () => {
    const rendererSource = readFileSync(
      new URL("../components/console/ConsoleExtensionPage.svelte", import.meta.url),
      "utf8",
    );

    expect(rendererSource).toContain('type: "number" | "range" | "range-number"');
    expect(rendererSource).toContain("data-console-page-panel-field");
    expect(rendererSource).toContain("data-console-page-record-list");
    expect(rendererSource).toContain("data-console-page-record-row");
    expect(rendererSource).toContain('kind: "dialog-panel-grid"');
    expect(rendererSource).toContain('kind: "integration-catalog"');
    expect(rendererSource).toContain("data-console-page-integration-catalog");
    expect(rendererSource).toContain("data-console-page-integration-card");
    expect(rendererSource).toContain("integrationInitials(item)");
    expect(rendererSource).toContain("integrationStatusClass(item.status.tone)");
    expect(rendererSource).toContain("openPanelGridDialog(section)");
    expect(rendererSource).toContain("bind:open={panelGridDialogOpen}");
    expect(rendererSource).toContain("data-console-page-dialog-panel-body");
    expect(rendererSource).toContain("px-5 pb-5 sm:px-8 sm:pb-8");
    expect(rendererSource).toContain("fieldBindings?: Record<string, string>");
    expect(rendererSource).toContain("requestActionBody(action, item)");
    expect(rendererSource).toContain('kind: "tiered-unit-rate"');
    expect(rendererSource).toContain("<table");
    expect(rendererSource).toContain("<thead");
    expect(rendererSource).toContain('import { goto } from "$app/navigation";');
    expect(rendererSource).toContain('settingsScope?: "organization" | "instance" | null');
    expect(rendererSource).toContain("items={instanceSettingsItems");
    expect(rendererSource).toContain("placeholderData: (previousData) => previousData");
    expect(rendererSource).toContain("navigateConsolePageHref(filter.href)");
    expect(rendererSource).toContain("noScroll: true");
    expect(rendererSource).not.toContain("href={filter.href}");
    expect(rendererSource).not.toContain("<Table.Root");
    expect(rendererSource).not.toContain('from "$lib/components/ui/table"');
  });

  test("[CONSOLE-EXT-PAGE-003] embeds owner-scoped console panel hosts in project and resource pages", () => {
    const panelHostSource = readFileSync(
      new URL("../components/console/ConsoleExtensionPanelHost.svelte", import.meta.url),
      "utf8",
    );
    const projectPageSource = readFileSync(
      new URL("../../routes/projects/[projectId=consoleObjectId]/+page.svelte", import.meta.url),
      "utf8",
    );
    const resourcePageSource = readFileSync(
      new URL("../../routes/resources/[resourceId=consoleObjectId]/+page.svelte", import.meta.url),
      "utf8",
    );

    expect(panelHostSource).toContain("data-console-extension-panel-host");
    expect(panelHostSource).toContain("findConsolePanelExtensionsByPlacement");
    expect(panelHostSource).toContain("projectId");
    expect(panelHostSource).toContain("environmentId");
    expect(panelHostSource).toContain("resourceId");
    expect(panelHostSource).toContain("type ConsolePageRequestAction");
    expect(panelHostSource).toContain("collapsedByDefault?: boolean");
    expect(panelHostSource).toContain("expandedPanelKeys");
    expect(panelHostSource).toContain("togglePanel(result)");
    expect(panelHostSource).toContain("runRequestAction(action, item)");
    expect(panelHostSource).toContain("data-console-extension-panel-host");
    expect(projectPageSource).toContain('placement="project-environment-panel"');
    expect(projectPageSource).toContain("environmentId={environment.id}");
    expect(resourcePageSource).toContain('placement="resource-detail-panel"');
    expect(resourcePageSource).toContain("projectId={resourceProjectId}");
    expect(resourcePageSource).toContain("environmentId={resourceEnvironmentId}");
  });
});
