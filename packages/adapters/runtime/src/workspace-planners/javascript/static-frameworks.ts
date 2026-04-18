import {
  type SourceDescriptor,
  type SourceDetectedScript,
  type SourceFramework,
  type SourceInspectionSnapshot,
} from "@appaloft/core";
import { type RequestedDeploymentConfig } from "@appaloft/application";
import { resolveNodePackageManager, type NodePackageManager } from "../node";

export interface StaticFrameworkPlan {
  plannerKey: string;
  framework: SourceFramework;
  publishDirectory: string;
  baseImage: string;
  installCommand?: string;
  buildCommand?: string;
  metadata: Record<string, string>;
}

interface StaticFrameworkDefaults {
  plannerKey: string;
  publishDirectory: string;
  buildScript: SourceDetectedScript;
  autoSelection: "framework" | "detected-build-script" | "explicit-static";
}

const staticFrameworkDefaults: Partial<Record<SourceFramework, StaticFrameworkDefaults>> = {
  astro: {
    plannerKey: "astro-static",
    publishDirectory: "/dist",
    buildScript: "build",
    autoSelection: "framework",
  },
  nuxt: {
    plannerKey: "nuxt-static",
    publishDirectory: "/.output/public",
    buildScript: "generate",
    autoSelection: "detected-build-script",
  },
  sveltekit: {
    plannerKey: "sveltekit-static",
    publishDirectory: "/build",
    buildScript: "build",
    autoSelection: "explicit-static",
  },
  vite: {
    plannerKey: "vite-static",
    publishDirectory: "/dist",
    buildScript: "build",
    autoSelection: "framework",
  },
};

function installCommandFor(packageManager: NodePackageManager): string {
  switch (packageManager) {
    case "bun":
      return "bun install";
    case "pnpm":
      return "pnpm install";
    case "yarn":
      return "yarn install --frozen-lockfile";
    case "npm":
      return "npm install";
  }
}

function runCommandFor(packageManager: NodePackageManager, script: string): string {
  switch (packageManager) {
    case "bun":
      return `bun run ${script}`;
    case "pnpm":
      return `pnpm ${script}`;
    case "yarn":
      return `yarn ${script}`;
    case "npm":
      return `npm run ${script}`;
  }
}

function baseImageFor(inspection?: SourceInspectionSnapshot): string {
  if (inspection?.packageManager === "bun") {
    return "oven/bun:1-alpine";
  }

  return `node:${inspection?.runtimeVersion ?? "22"}-alpine`;
}

function canSelectStaticFrameworkPlan(input: {
  defaults: StaticFrameworkDefaults;
  requestedDeployment: RequestedDeploymentConfig;
  inspection: SourceInspectionSnapshot | undefined;
}): boolean {
  const explicitStatic =
    input.requestedDeployment.method === "static" ||
    Boolean(input.requestedDeployment.publishDirectory);

  switch (input.defaults.autoSelection) {
    case "framework":
      return true;
    case "detected-build-script":
      return explicitStatic || Boolean(input.inspection?.hasDetectedScript(input.defaults.buildScript));
    case "explicit-static":
      return explicitStatic;
  }
}

export function resolveStaticFrameworkPlan(input: {
  source: SourceDescriptor;
  requestedDeployment: RequestedDeploymentConfig;
}): StaticFrameworkPlan | null {
  const framework = input.source.inspection?.framework;
  const defaults = framework ? staticFrameworkDefaults[framework] : undefined;
  const publishDirectory = input.requestedDeployment.publishDirectory ?? defaults?.publishDirectory;

  if (
    !framework ||
    !publishDirectory ||
    !defaults ||
    !canSelectStaticFrameworkPlan({
      defaults,
      requestedDeployment: input.requestedDeployment,
      inspection: input.source.inspection,
    })
  ) {
    return null;
  }

  const packageManager = resolveNodePackageManager(input.source.inspection);
  const baseImage = baseImageFor(input.source.inspection);
  const buildCommand =
    input.requestedDeployment.buildCommand ??
    (input.source.inspection?.hasDetectedScript(defaults.buildScript)
      ? runCommandFor(packageManager, defaults.buildScript)
      : undefined);
  const installCommand =
    input.requestedDeployment.installCommand ??
    (input.source.inspection?.hasDetectedFile("package-json")
      ? installCommandFor(packageManager)
      : undefined);

  return {
    plannerKey: defaults.plannerKey,
    framework,
    publishDirectory,
    baseImage,
    ...(installCommand ? { installCommand } : {}),
    ...(buildCommand ? { buildCommand } : {}),
    metadata: {
      planner: defaults.plannerKey,
      runtimeKind: "static",
      framework,
      packageManager,
      baseImage,
      ...(input.source.inspection?.projectName
        ? { projectName: input.source.inspection.projectName }
        : {}),
    },
  };
}
