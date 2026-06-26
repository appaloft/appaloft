import { describe, expect, test } from "bun:test";

import {
  isPluginCompatible,
  pluginManifestSchema,
  systemPluginWebExtensionSchema,
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
});
