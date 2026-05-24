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
});
