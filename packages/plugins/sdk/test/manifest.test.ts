import { describe, expect, test } from "bun:test";

import {
  isPluginCompatible,
  pluginManifestSchema,
  systemPluginWebExtensionSchema,
  systemPluginWebHeadContributionSchema,
} from "../src/index";

describe("plugin manifest contract", () => {
  test("accepts valid manifests and enforces compatibility ranges", () => {
    const manifest = pluginManifestSchema.parse({
      name: "builtin-fake-runtime",
      displayName: "Builtin Fake Runtime",
      description: "Example runtime plugin",
      version: "0.1.0",
      kind: "user-extension",
      compatibilityRange: "^0.1.0",
      capabilities: ["deployment-hook", "source-detector"],
      entrypoint: "internal://builtin-fake-runtime",
    });

    expect(isPluginCompatible(manifest, "0.1.0")).toBe(true);
    expect(isPluginCompatible(manifest, "0.2.0")).toBe(false);
  });

  test("keeps wildcard system extension compatibility active for deployment SHAs", () => {
    const manifest = pluginManifestSchema.parse({
      name: "configured-http-routes",
      displayName: "Configured HTTP Routes",
      description: "Runtime configured system routes",
      version: "0.0.0",
      kind: "system-extension",
      compatibilityRange: "*",
      capabilities: ["http-route"],
      entrypoint: "appaloft-server://configured-routes",
    });

    expect(isPluginCompatible(manifest, "0313c2dd90333931d3b6d767668f6f36774735fa")).toBe(true);
  });

  test("[WEB-HEAD-CONTRIB-001] accepts web head contributions from system plugins", () => {
    const manifest = pluginManifestSchema.parse({
      name: "configured-web-head",
      displayName: "Configured Web Head",
      description: "Runtime configured Web Console head contributions.",
      version: "0.0.0",
      kind: "system-extension",
      compatibilityRange: "*",
      capabilities: ["web-head"],
      entrypoint: "appaloft-server://configured-web-head",
    });

    expect(isPluginCompatible(manifest, "0313c2dd90333931d3b6d767668f6f36774735fa")).toBe(true);
    expect(
      systemPluginWebHeadContributionSchema.parse({
        key: "configured-runtime-script",
        html: '<script type="application/json" id="configured-runtime">{}</script>',
      }),
    ).toMatchObject({
      key: "configured-runtime-script",
      html: expect.stringContaining("configured-runtime"),
    });
  });

  test("accepts quick-deploy source web extension placement", () => {
    expect(
      systemPluginWebExtensionSchema.parse({
        key: "example-blueprint-source",
        title: "Blueprint source",
        description: "Selects a Blueprint from a registered catalog.",
        path: "/blueprints",
        placement: "quick-deploy-source",
        target: "server-page",
        requiresAuth: false,
      }),
    ).toMatchObject({
      key: "example-blueprint-source",
      placement: "quick-deploy-source",
    });
  });

  test("accepts owner-scoped console panel web extension placements", () => {
    for (const placement of ["project-environment-panel", "resource-detail-panel"] as const) {
      expect(
        systemPluginWebExtensionSchema.parse({
          key: `example-${placement}`,
          title: "Owner panel",
          description: "Shows context-aware console panel data.",
          path: "/owner-panel",
          placement,
          target: "console-route",
          requiresAuth: true,
          metadata: {
            renderer: "console-page",
            pageEndpoint:
              "/example/owner-panel?projectId={projectId}&environmentId={environmentId}&resourceId={resourceId}",
          },
        }),
      ).toMatchObject({
        placement,
        target: "console-route",
      });
    }
  });

  test("accepts injected domain error modal web extension placement", () => {
    expect(
      systemPluginWebExtensionSchema.parse({
        key: "example-domain-error-modal",
        title: "Domain error help",
        description: "Shows a domain-specific recovery path for handled console errors.",
        path: "/domain-error-help",
        placement: "domain-error-modal",
        target: "console-route",
        requiresAuth: true,
        metadata: {
          renderer: "console-domain-error-modal",
          errorCodes: ["plan_limit_exceeded"],
          pageEndpoint:
            "/example/domain-error-help?organizationId={organizationId}&errorCode={errorCode}",
        },
      }),
    ).toMatchObject({
      key: "example-domain-error-modal",
      placement: "domain-error-modal",
      target: "console-route",
      metadata: {
        renderer: "console-domain-error-modal",
      },
    });
  });

  test("accepts operation intent modal web extension placement", () => {
    expect(
      systemPluginWebExtensionSchema.parse({
        key: "example-operation-intent-modal",
        title: "Operation intent",
        description: "Shows a provider-owned modal before a handled console operation.",
        path: "/operation-intent",
        placement: "operation-intent-modal",
        target: "console-route",
        requiresAuth: true,
        metadata: {
          renderer: "console-operation-intent-modal",
          operationKey: "servers.register",
          intent: "create-server",
          pageEndpoint:
            "/example/operation-intent?organizationId={organizationId}&operationKey={operationKey}&intent={intent}",
          visibilityEndpoint:
            "/example/operation-intent/visibility?organizationId={organizationId}&currentServerCount={currentServerCount}",
        },
      }),
    ).toMatchObject({
      key: "example-operation-intent-modal",
      placement: "operation-intent-modal",
      target: "console-route",
      metadata: {
        renderer: "console-operation-intent-modal",
        operationKey: "servers.register",
        intent: "create-server",
      },
    });
  });

  test("accepts console route web extension metadata", () => {
    expect(
      systemPluginWebExtensionSchema.parse({
        key: "example-marketplace",
        title: "Marketplace",
        localizations: {
          "zh-CN": {
            title: "应用市场",
            description: "浏览可安装应用。",
          },
          "en-US": {
            title: "Marketplace",
            description: "Browse installable applications.",
          },
        },
        path: "/marketplace",
        icon: {
          src: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E",
          label: "Marketplace",
        },
        placement: "navigation",
        target: "console-route",
        requiresAuth: false,
        metadata: {
          renderer: "blueprint-catalog",
          listEndpoint: "/example/blueprints",
        },
      }),
    ).toMatchObject({
      key: "example-marketplace",
      icon: {
        src: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E",
        label: "Marketplace",
      },
      localizations: {
        "zh-CN": {
          title: "应用市场",
        },
      },
      target: "console-route",
      metadata: {
        renderer: "blueprint-catalog",
      },
    });
  });

  test("[DASH-EXT-002] accepts owner-scoped Dashboard navigation metadata", () => {
    expect(
      systemPluginWebExtensionSchema.parse({
        key: "resource-audit-log",
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
            key: "resource-audit-log",
            labelKey: "extensions.auditLog",
            iconKey: "activity",
            order: 120,
            routeTemplate:
              "/projects/{projectId}/resources/{resourceId}/overview?environment={environmentId}",
            visibilityEndpoint:
              "/api/audit-log/visibility?projectId={projectId}&resourceId={resourceId}",
          },
        },
      }),
    ).toMatchObject({
      metadata: {
        scopedNavigation: {
          scope: "resource",
          destination: "overview",
          presentation: "section",
        },
      },
    });
  });

  test("[DASH-EXT-002] rejects a destination that does not belong to the declared owner scope", () => {
    expect(() =>
      systemPluginWebExtensionSchema.parse({
        key: "invalid-scoped-extension",
        title: "Invalid scoped extension",
        path: "/invalid",
        placement: "route",
        target: "console-route",
        requiresAuth: true,
        metadata: {
          scopedNavigation: {
            scope: "workspace",
            destination: "deployments",
            presentation: "page",
            key: "invalid-scoped-extension",
            labelKey: "extensions.invalid",
            iconKey: "activity",
            order: 10,
            routeTemplate: "/invalid",
          },
        },
      }),
    ).toThrow();
  });

  test("[DASH-EXT-003] keeps legacy and unknown metadata additive", () => {
    expect(
      systemPluginWebExtensionSchema.parse({
        key: "legacy-console-page",
        title: "Legacy page",
        path: "/legacy",
        placement: "navigation",
        target: "console-route",
        requiresAuth: true,
        metadata: {
          renderer: "console-page",
          pageEndpoint: "/api/legacy",
          futureDashboardField: { version: 2 },
        },
      }),
    ).toMatchObject({
      metadata: {
        renderer: "console-page",
        pageEndpoint: "/api/legacy",
        futureDashboardField: { version: 2 },
      },
    });
  });
});
