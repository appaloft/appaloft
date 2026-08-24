import { join } from "node:path";

export const consoleSurfacePresets = ["legacy-console-v1", "dashboard-v2"] as const;
export type ConsoleSurfacePreset = (typeof consoleSurfacePresets)[number];

export interface ConsoleSurface {
  preset: ConsoleSurfacePreset;
  appRoot: string;
  buildDir: string;
  packageName: "@appaloft/web" | "@appaloft/dashboard";
}

export function resolveConsoleSurface(input: { root: string; preset?: string }): ConsoleSurface {
  const preset = input.preset?.trim() || "legacy-console-v1";

  if (!consoleSurfacePresets.includes(preset as ConsoleSurfacePreset)) {
    throw new Error(
      `Unsupported console surface preset: ${preset}. Expected ${consoleSurfacePresets.join(" or ")}.`,
    );
  }

  if (preset === "dashboard-v2") {
    const appRoot = join(input.root, "apps", "dashboard");
    return {
      preset,
      appRoot,
      buildDir: join(appRoot, "build"),
      packageName: "@appaloft/dashboard",
    };
  }

  const appRoot = join(input.root, "apps", "web");
  return {
    preset: "legacy-console-v1",
    appRoot,
    buildDir: join(appRoot, "build"),
    packageName: "@appaloft/web",
  };
}
