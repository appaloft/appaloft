import { describe, expect, test } from "vitest";

import { collectStaticManifestFiles, type ViteManifest } from "../scripts/check-bundle-budget";

describe("Dashboard bundle graph", () => {
  test("includes static imports but excludes inactive dynamic destinations", () => {
    const manifest: ViteManifest = {
      app: {
        file: "entry/app.js",
        imports: ["shared"],
        dynamicImports: ["resource-logs", "resource-settings"],
      },
      shared: { file: "chunks/shared.js" },
      "resource-logs": {
        file: "chunks/resource-logs.js",
        imports: ["shared", "charts"],
        isDynamicEntry: true,
      },
      charts: { file: "chunks/charts.js" },
      "resource-settings": {
        file: "chunks/resource-settings.js",
        imports: ["shared"],
        isDynamicEntry: true,
      },
    };

    expect(collectStaticManifestFiles(manifest, ["app"])).toEqual([
      "chunks/shared.js",
      "entry/app.js",
    ]);
    expect(collectStaticManifestFiles(manifest, ["app", "resource-logs"])).toEqual([
      "chunks/charts.js",
      "chunks/resource-logs.js",
      "chunks/shared.js",
      "entry/app.js",
    ]);
    expect(collectStaticManifestFiles(manifest, ["app", "resource-logs"])).not.toContain(
      "chunks/resource-settings.js",
    );
  });
});
