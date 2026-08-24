import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { consoleSurfacePresets, resolveConsoleSurface } from "../release/lib/console-surface";

describe("console static surface selection", () => {
  test("[DASH-FOUND-001] keeps legacy-console-v1 as the release default", () => {
    expect(consoleSurfacePresets).toEqual(["legacy-console-v1", "dashboard-v2"]);
    expect(resolveConsoleSurface({ root: "/repo" })).toEqual({
      preset: "legacy-console-v1",
      appRoot: join("/repo", "apps", "web"),
      buildDir: join("/repo", "apps", "web", "build"),
      packageName: "@appaloft/web",
    });
  });

  test("[DASH-FOUND-001] selects Dashboard only through the explicit preset", () => {
    expect(resolveConsoleSurface({ root: "/repo", preset: "dashboard-v2" })).toEqual({
      preset: "dashboard-v2",
      appRoot: join("/repo", "apps", "dashboard"),
      buildDir: join("/repo", "apps", "dashboard", "build"),
      packageName: "@appaloft/dashboard",
    });
  });

  test("[DASH-FOUND-001] rejects unknown presets instead of mixing surfaces", () => {
    expect(() => resolveConsoleSurface({ root: "/repo", preset: "hybrid" })).toThrow(
      "Unsupported console surface preset",
    );
  });
});
