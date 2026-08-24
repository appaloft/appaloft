import { describe, expect, test } from "vitest";
import type { SystemPluginWebExtension } from "@appaloft/contracts";

import { activeScopedExtensions, isConsoleExtensionPageDocumentV1 } from "./extensions";
import { parseDashboardRoute, workspaceNavigation } from "./navigation";

const extensions: SystemPluginWebExtension[] = [
  {
    key: "resource-audit",
    pluginName: "audit-log",
    pluginDisplayName: "Audit log",
    title: "Audit log",
    path: "/audit-log",
    placement: "route",
    target: "console-route",
    requiresAuth: true,
    metadata: {
      renderer: "console-page",
      pageEndpoint:
        "/api/audit-log?projectId={projectId}&environmentId={environmentId}&resourceId={resourceId}",
      scopedNavigation: {
        scope: "resource",
        destination: "overview",
        presentation: "section",
        key: "resource-audit",
        labelKey: "extensions.auditLog",
        iconKey: "activity",
        order: 20,
        routeTemplate:
          "/projects/{projectId}/resources/{resourceId}/overview?environment={environmentId}",
        visibilityEndpoint: "/api/audit-log/visibility?resourceId={resourceId}",
      },
    },
  },
  {
    key: "workspace-billing",
    pluginName: "billing",
    pluginDisplayName: "Billing",
    title: "Billing",
    path: "/billing",
    placement: "navigation",
    target: "console-route",
    requiresAuth: true,
    metadata: {
      scopedNavigation: {
        scope: "workspace",
        destination: "settings",
        presentation: "section",
        key: "workspace-billing",
        labelKey: "extensions.billing",
        iconKey: "wallet",
        order: 10,
        routeTemplate: "/settings",
      },
    },
  },
  {
    key: "legacy-navigation",
    pluginName: "legacy",
    pluginDisplayName: "Legacy",
    title: "Legacy",
    path: "/legacy",
    placement: "navigation",
    target: "console-route",
    requiresAuth: true,
    metadata: { renderer: "console-page", pageEndpoint: "/api/legacy" },
  },
];

describe("Dashboard scoped extensions", () => {
  test("[DASH-EXT-001] accepts the existing v1 page-document contract", () => {
    expect(
      isConsoleExtensionPageDocumentV1({
        schemaVersion: "appaloft.console.extension-page/v1",
        title: "Audit log",
        sections: [{ kind: "table", columns: [], rows: [] }],
      }),
    ).toBe(true);
    expect(
      isConsoleExtensionPageDocumentV1({
        schemaVersion: "appaloft.console.extension-page/v2",
        title: "Forked contract",
        sections: [],
      }),
    ).toBe(false);
  });

  test("[DASH-EXT-002][DASH-EXT-004] selects only the active owner destination", () => {
    const active = activeScopedExtensions(
      extensions,
      parseDashboardRoute("/projects/proj_1/resources/res_9/overview?environment=env_2"),
    );

    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      route: "/projects/proj_1/resources/res_9/overview?environment=env_2",
      pageEndpoint: "/api/audit-log?projectId=proj_1&environmentId=env_2&resourceId=res_9",
      visibilityEndpoint: "/api/audit-log/visibility?resourceId=res_9",
      navigation: { key: "resource-audit", scope: "resource", destination: "overview" },
    });
  });

  test("[DASH-EXT-003] never promotes legacy or unknown metadata into Workspace navigation", () => {
    expect(activeScopedExtensions(extensions, parseDashboardRoute("/projects"))).toEqual([]);
    expect(workspaceNavigation.map(({ id }) => id)).toEqual([
      "projects",
      "infrastructure",
      "activity",
      "marketplace",
      "settings",
    ]);
  });
});
