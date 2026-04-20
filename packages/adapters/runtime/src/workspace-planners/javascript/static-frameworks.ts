import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type SourceApplicationShape,
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
  applicationShape: Extract<SourceApplicationShape, "static">;
  installCommand?: string;
  buildCommand?: string;
  metadata: Record<string, string>;
}

interface StaticFrameworkDefaults {
  plannerKey: string;
  publishDirectory: string;
  buildScript: SourceDetectedScript;
  autoSelection:
    | "framework"
    | "detected-build-script"
    | "detected-export-script"
    | "explicit-static";
}

const staticFrameworkDefaults: Partial<Record<SourceFramework, StaticFrameworkDefaults>> = {
  angular: {
    plannerKey: "angular-static",
    publishDirectory: "/dist",
    buildScript: "build",
    autoSelection: "framework",
  },
  astro: {
    plannerKey: "astro-static",
    publishDirectory: "/dist",
    buildScript: "build",
    autoSelection: "framework",
  },
  nextjs: {
    plannerKey: "nextjs-static",
    publishDirectory: "/out",
    buildScript: "build",
    autoSelection: "detected-export-script",
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

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizePublishDirectory(path: string): string {
  const normalized = path.replace(/^\.?\//u, "").replace(/\/+$/u, "");
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function joinedPublishDirectory(base: string, child: string): string {
  return `${base.replace(/\/+$/u, "")}/${child.replace(/^\/+/u, "")}`;
}

function angularOutputPathFromValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return normalizePublishDirectory(value.trim());
  }

  const outputPath = objectRecord(value);
  const base = typeof outputPath.base === "string" ? outputPath.base.trim() : undefined;
  const browser =
    typeof outputPath.browser === "string" ? outputPath.browser.trim() : undefined;

  if (base && browser) {
    return normalizePublishDirectory(joinedPublishDirectory(base, browser));
  }

  return base ? normalizePublishDirectory(base) : undefined;
}

function angularOutputPathFromProject(value: unknown): string | undefined {
  const project = objectRecord(value);
  const targets = objectRecord(project.architect ?? project.targets);
  const build = objectRecord(targets.build);
  const options = objectRecord(build.options);

  return angularOutputPathFromValue(options.outputPath);
}

function angularPublishDirectory(source: SourceDescriptor): string | undefined {
  const angularJsonPath = join(source.locator, "angular.json");

  if (!existsSync(angularJsonPath)) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(readFileSync(angularJsonPath, "utf8")) as unknown;
    const projects = objectRecord(objectRecord(parsed).projects);
    const preferredProject = source.inspection?.projectName
      ? projects[source.inspection.projectName]
      : undefined;
    const candidateProjects = [
      ...(preferredProject ? [preferredProject] : []),
      ...Object.values(projects),
    ];

    for (const project of candidateProjects) {
      const outputPath = angularOutputPathFromProject(project);
      if (outputPath) {
        return outputPath;
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function publishDirectoryFor(input: {
  source: SourceDescriptor;
  framework: SourceFramework;
  defaults: StaticFrameworkDefaults;
}): string {
  if (input.framework === "angular") {
    return angularPublishDirectory(input.source) ?? input.defaults.publishDirectory;
  }

  return input.defaults.publishDirectory;
}

function canSelectStaticFrameworkPlan(input: {
  defaults: StaticFrameworkDefaults;
  requestedDeployment: RequestedDeploymentConfig;
  inspection: SourceInspectionSnapshot | undefined;
}): boolean {
  const explicitStatic =
    input.requestedDeployment.method === "static" ||
    Boolean(input.requestedDeployment.publishDirectory);

  if (input.inspection?.applicationShape === "static") {
    return true;
  }

  switch (input.defaults.autoSelection) {
    case "framework":
      return true;
    case "detected-build-script":
      return explicitStatic || Boolean(input.inspection?.hasDetectedScript(input.defaults.buildScript));
    case "detected-export-script":
      return explicitStatic || Boolean(input.inspection?.hasDetectedScript("export"));
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

  if (!framework || !defaults) {
    return null;
  }

  const publishDirectory =
    input.requestedDeployment.publishDirectory ??
    publishDirectoryFor({ source: input.source, framework, defaults });

  if (
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
    applicationShape: "static",
    ...(installCommand ? { installCommand } : {}),
    ...(buildCommand ? { buildCommand } : {}),
    metadata: {
      planner: defaults.plannerKey,
      runtimeKind: "static",
      framework,
      packageManager,
      baseImage,
      applicationShape: "static",
      ...(input.source.inspection?.projectName
        ? { projectName: input.source.inspection.projectName }
        : {}),
    },
  };
}
