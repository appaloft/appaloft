import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { consoleSurfacePresets, resolveConsoleSurface } from "../release/lib/console-surface";

describe("console static surface selection", () => {
  test("[DASH-DEFAULT-003] selects Dashboard as the release default", () => {
    expect(consoleSurfacePresets).toEqual(["legacy-console-v1", "dashboard-v2"]);
    expect(resolveConsoleSurface({ root: "/repo" })).toEqual({
      preset: "dashboard-v2",
      appRoot: join("/repo", "apps", "dashboard"),
      buildDir: join("/repo", "apps", "dashboard", "build"),
      packageName: "@appaloft/dashboard",
    });
  });

  test("[DASH-DEFAULT-003] retains the explicit legacy rollback selector", () => {
    expect(resolveConsoleSurface({ root: "/repo", preset: "legacy-console-v1" })).toEqual({
      preset: "legacy-console-v1",
      appRoot: join("/repo", "apps", "web"),
      buildDir: join("/repo", "apps", "web", "build"),
      packageName: "@appaloft/web",
    });
  });

  test("[DASH-FOUND-001] rejects unknown presets instead of mixing surfaces", () => {
    expect(() => resolveConsoleSurface({ root: "/repo", preset: "hybrid" })).toThrow(
      "Unsupported console surface preset",
    );
  });

  test("[DASH-DEFAULT-003] makes root development explicit and reversible", async () => {
    const packageJson = (await Bun.file(new URL("../../package.json", import.meta.url)).json()) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts.dev).toContain("--filter=@appaloft/dashboard");
    expect(packageJson.scripts["dev:legacy-web"]).toContain("--filter=@appaloft/web");
  });
});
