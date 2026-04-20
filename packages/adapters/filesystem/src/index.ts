import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import {
  appaloftTraceAttributes,
  createAdapterSpanName,
  type DeploymentConfigReader,
  type DeploymentConfigSnapshot,
  type ExecutionContext,
  type SourceDetectionResult,
  type SourceDetector,
} from "@appaloft/application";
import {
  DisplayNameText,
  domainError,
  err,
  FilePathText,
  ok,
  type Result,
  type SourceApplicationShape,
  SourceApplicationShapeValue,
  SourceDescriptor,
  type SourceDetectedFile,
  SourceDetectedFileValue,
  type SourceDetectedScript,
  SourceDetectedScriptValue,
  type SourceFramework,
  SourceFrameworkValue,
  SourceInspectionSnapshot,
  type SourceKind,
  SourceKindValue,
  SourceLocator,
  type SourcePackageManager,
  SourcePackageManagerValue,
  type SourceRuntimeFamily,
  SourceRuntimeFamilyValue,
  SourceRuntimeVersionText,
} from "@appaloft/core";
import {
  type AppaloftDeploymentConfig,
  appaloftDeploymentConfigFileNames,
  parseAppaloftDeploymentConfigText,
} from "@appaloft/deployment-config";

interface LocalProjectProfile {
  runtimeFamily: Extract<SourceRuntimeFamily, "java" | "node" | "python">;
  framework?: SourceFramework;
  packageManager?: SourcePackageManager;
  applicationShape?: SourceApplicationShape;
  runtimeVersion?: string;
  projectName?: string;
  detectedFiles: SourceDetectedFile[];
  detectedScripts: SourceDetectedScript[];
}

interface LocalProjectProfileDetector {
  detect(path: string): LocalProjectProfile | null;
}

function readJsonObject(path: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function readFirstExistingText(path: string, fileNames: string[]): string | null {
  for (const fileName of fileNames) {
    const text = readText(join(path, fileName));
    if (text !== null) {
      return text;
    }
  }

  return null;
}

function firstLine(text: string | null): string | undefined {
  return text
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
}

function readFirstExistingVersion(path: string, fileNames: string[]): string | undefined {
  for (const fileName of fileNames) {
    const version = firstLine(readText(join(path, fileName)));
    if (version) {
      return version;
    }
  }

  return undefined;
}

function stringRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasPackage(
  dependencies: Record<string, unknown>,
  devDependencies: Record<string, unknown>,
  packageName: string,
): boolean {
  return packageName in dependencies || packageName in devDependencies;
}

function hasAnyPackage(
  dependencies: Record<string, unknown>,
  devDependencies: Record<string, unknown>,
  packageNames: readonly string[],
): boolean {
  return packageNames.some((packageName) => hasPackage(dependencies, devDependencies, packageName));
}

function detectNodePackageManager(
  path: string,
  packageJson: Record<string, unknown> | null,
): SourcePackageManager {
  const configuredPackageManager =
    typeof packageJson?.packageManager === "string" ? packageJson.packageManager : undefined;

  if (configuredPackageManager?.startsWith("bun")) {
    return "bun";
  }

  if (configuredPackageManager?.startsWith("pnpm")) {
    return "pnpm";
  }

  if (configuredPackageManager?.startsWith("yarn")) {
    return "yarn";
  }

  if (existsSync(join(path, "bun.lock")) || existsSync(join(path, "bun.lockb"))) {
    return "bun";
  }

  if (existsSync(join(path, "pnpm-lock.yaml"))) {
    return "pnpm";
  }

  if (existsSync(join(path, "yarn.lock"))) {
    return "yarn";
  }

  return "npm";
}

function detectNodeFramework(input: {
  path: string;
  dependencies: Record<string, unknown>;
  devDependencies: Record<string, unknown>;
}): SourceFramework | undefined {
  const { path, dependencies, devDependencies } = input;

  if (
    hasPackage(dependencies, devDependencies, "next") ||
    existsSync(join(path, "next.config.js")) ||
    existsSync(join(path, "next.config.mjs")) ||
    existsSync(join(path, "next.config.ts"))
  ) {
    return "nextjs";
  }

  if (
    hasPackage(dependencies, devDependencies, "@sveltejs/kit") ||
    existsSync(join(path, "svelte.config.js")) ||
    existsSync(join(path, "svelte.config.mjs")) ||
    existsSync(join(path, "svelte.config.ts"))
  ) {
    return "sveltekit";
  }

  if (
    hasPackage(dependencies, devDependencies, "nuxt") ||
    existsSync(join(path, "nuxt.config.js")) ||
    existsSync(join(path, "nuxt.config.mjs")) ||
    existsSync(join(path, "nuxt.config.ts"))
  ) {
    return "nuxt";
  }

  if (
    hasPackage(dependencies, devDependencies, "astro") ||
    existsSync(join(path, "astro.config.mjs"))
  ) {
    return "astro";
  }

  if (
    hasAnyPackage(dependencies, devDependencies, ["@remix-run/node", "@remix-run/react"]) ||
    existsSync(join(path, "remix.config.js"))
  ) {
    return "remix";
  }

  if (
    hasPackage(dependencies, devDependencies, "@angular/core") ||
    existsSync(join(path, "angular.json"))
  ) {
    return "angular";
  }

  if (
    hasPackage(dependencies, devDependencies, "vite") ||
    existsSync(join(path, "vite.config.js")) ||
    existsSync(join(path, "vite.config.mjs")) ||
    existsSync(join(path, "vite.config.ts"))
  ) {
    return "vite";
  }

  if (hasPackage(dependencies, devDependencies, "@nestjs/core")) {
    return "nestjs";
  }

  if (hasPackage(dependencies, devDependencies, "fastify")) {
    return "fastify";
  }

  if (hasPackage(dependencies, devDependencies, "hono")) {
    return "hono";
  }

  if (hasPackage(dependencies, devDependencies, "koa")) {
    return "koa";
  }

  if (hasPackage(dependencies, devDependencies, "express")) {
    return "express";
  }

  return undefined;
}

function applicationShapeForFramework(
  framework: SourceFramework | undefined,
): SourceApplicationShape | undefined {
  switch (framework) {
    case "angular":
    case "astro":
    case "vite":
      return "static";
    case "nextjs":
    case "nuxt":
    case "remix":
      return "ssr";
    case "sveltekit":
      return "hybrid-static-server";
    case "django":
    case "express":
    case "fastapi":
    case "fastify":
    case "flask":
    case "hono":
    case "koa":
    case "nestjs":
      return "serverful-http";
    default:
      return undefined;
  }
}

function applicationShapeForNodeProject(input: {
  path: string;
  framework: SourceFramework | undefined;
  detectedScripts: SourceDetectedScript[];
}): SourceApplicationShape | undefined {
  switch (input.framework) {
    case "nextjs":
      if (input.detectedScripts.includes("export") || hasNextStaticExportConfig(input.path)) {
        return "static";
      }
      break;
    case "nuxt":
      if (input.detectedScripts.includes("generate")) {
        return "static";
      }
      break;
    case "sveltekit":
      if (hasSvelteKitStaticAdapter(input.path)) {
        return "static";
      }
      break;
    default:
      break;
  }

  return applicationShapeForFramework(input.framework);
}

function hasNextStaticExportConfig(path: string): boolean {
  const config = readFirstExistingText(path, [
    "next.config.js",
    "next.config.mjs",
    "next.config.ts",
  ]);

  return /\boutput\s*:\s*["']export["']/u.test(config ?? "");
}

function hasSvelteKitStaticAdapter(path: string): boolean {
  const config = readFirstExistingText(path, [
    "svelte.config.js",
    "svelte.config.mjs",
    "svelte.config.ts",
  ]);

  return /@sveltejs\/adapter-static\b/u.test(config ?? "");
}

function nodeDetectedFiles(path: string): SourceDetectedFile[] {
  return [
    "package-json",
    ...(existsSync(join(path, "bun.lock")) || existsSync(join(path, "bun.lockb"))
      ? ["bun-lock" as const]
      : []),
    ...(existsSync(join(path, "package-lock.json")) ? ["package-lock" as const] : []),
    ...(existsSync(join(path, "pnpm-lock.yaml")) ? ["pnpm-lock" as const] : []),
    ...(existsSync(join(path, "yarn.lock")) ? ["yarn-lock" as const] : []),
    ...(existsSync(join(path, "next.config.js")) ||
    existsSync(join(path, "next.config.mjs")) ||
    existsSync(join(path, "next.config.ts"))
      ? ["next-config" as const]
      : []),
    ...(existsSync(join(path, "vite.config.js")) ||
    existsSync(join(path, "vite.config.mjs")) ||
    existsSync(join(path, "vite.config.ts"))
      ? ["vite-config" as const]
      : []),
    ...(existsSync(join(path, "svelte.config.js")) ||
    existsSync(join(path, "svelte.config.mjs")) ||
    existsSync(join(path, "svelte.config.ts"))
      ? ["svelte-config" as const]
      : []),
    ...(existsSync(join(path, "nuxt.config.js")) ||
    existsSync(join(path, "nuxt.config.mjs")) ||
    existsSync(join(path, "nuxt.config.ts"))
      ? ["nuxt-config" as const]
      : []),
    ...(existsSync(join(path, "astro.config.mjs")) ||
    existsSync(join(path, "astro.config.js")) ||
    existsSync(join(path, "astro.config.ts"))
      ? ["astro-config" as const]
      : []),
    ...(existsSync(join(path, "remix.config.js")) ||
    existsSync(join(path, "remix.config.mjs")) ||
    existsSync(join(path, "remix.config.ts"))
      ? ["remix-config" as const]
      : []),
    ...(existsSync(join(path, "angular.json")) ? ["angular-json" as const] : []),
  ];
}

function nodeDetectedScripts(scripts: Record<string, unknown>): SourceDetectedScript[] {
  return [
    ...(typeof scripts.build === "string" ? ["build" as const] : []),
    ...(typeof scripts.dev === "string" ? ["dev" as const] : []),
    ...(typeof scripts.export === "string" ? ["export" as const] : []),
    ...(typeof scripts.generate === "string" ? ["generate" as const] : []),
    ...(typeof scripts.preview === "string" ? ["preview" as const] : []),
    ...(typeof scripts.serve === "string" ? ["serve" as const] : []),
    ...(typeof scripts.start === "string" ? ["start" as const] : []),
    ...(typeof scripts["start:built"] === "string" ? ["start-built" as const] : []),
  ];
}

function textMentionsPackage(text: string | null, packageName: string): boolean {
  if (!text) {
    return false;
  }

  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(
    `(^|[\\s"'=,\\[({])${escaped}(\\[[^\\]]+\\])?([\\s"',<>=!~;)\\]}]|$)`,
    "imu",
  ).test(text);
}

function detectPythonPackageManager(path: string, pyproject: string | null): SourcePackageManager {
  if (existsSync(join(path, "uv.lock"))) {
    return "uv";
  }

  if (existsSync(join(path, "poetry.lock")) || /^\s*\[tool\.poetry\]\s*$/m.test(pyproject ?? "")) {
    return "poetry";
  }

  return "pip";
}

function detectPythonFramework(input: {
  path: string;
  pyproject: string | null;
  requirements: string | null;
}): SourceFramework | undefined {
  const { path, pyproject, requirements } = input;
  const manifests = `${pyproject ?? ""}\n${requirements ?? ""}`;

  if (textMentionsPackage(manifests, "fastapi")) {
    return "fastapi";
  }

  if (textMentionsPackage(manifests, "django") || existsSync(join(path, "manage.py"))) {
    return "django";
  }

  if (textMentionsPackage(manifests, "flask")) {
    return "flask";
  }

  return undefined;
}

function pythonDetectedFiles(path: string): SourceDetectedFile[] {
  return [
    ...(existsSync(join(path, "pyproject.toml")) ? ["pyproject-toml" as const] : []),
    ...(existsSync(join(path, "requirements.txt")) ? ["requirements-txt" as const] : []),
    ...(existsSync(join(path, "uv.lock")) ? ["uv-lock" as const] : []),
    ...(existsSync(join(path, "poetry.lock")) ? ["poetry-lock" as const] : []),
    ...(existsSync(join(path, "manage.py")) ? ["django-manage" as const] : []),
  ];
}

class NodeProjectProfileDetector implements LocalProjectProfileDetector {
  detect(path: string): LocalProjectProfile | null {
    const packageJsonPath = join(path, "package.json");

    if (!existsSync(packageJsonPath)) {
      return null;
    }

    const packageJson = readJsonObject(packageJsonPath);
    const scripts = stringRecord(packageJson?.scripts);
    const packageManager = detectNodePackageManager(path, packageJson);
    const dependencies = stringRecord(packageJson?.dependencies);
    const devDependencies = stringRecord(packageJson?.devDependencies);
    const framework = detectNodeFramework({ path, dependencies, devDependencies });
    const detectedScripts = nodeDetectedScripts(scripts);
    const applicationShape = applicationShapeForNodeProject({ path, framework, detectedScripts });
    const engines = stringRecord(packageJson?.engines);
    const runtimeVersion =
      readFirstExistingVersion(path, [".node-version", ".nvmrc"]) ??
      (typeof engines.node === "string" ? engines.node : undefined);

    return {
      runtimeFamily: "node",
      ...(framework ? { framework } : {}),
      ...(applicationShape ? { applicationShape } : {}),
      packageManager,
      ...(runtimeVersion ? { runtimeVersion } : {}),
      ...(typeof packageJson?.name === "string" ? { projectName: packageJson.name } : {}),
      detectedFiles: nodeDetectedFiles(path),
      detectedScripts,
    };
  }
}

class PythonProjectProfileDetector implements LocalProjectProfileDetector {
  detect(path: string): LocalProjectProfile | null {
    const pyprojectPath = join(path, "pyproject.toml");
    const requirementsPath = join(path, "requirements.txt");

    if (!existsSync(pyprojectPath) && !existsSync(requirementsPath)) {
      return null;
    }

    const pyproject = existsSync(pyprojectPath) ? readText(pyprojectPath) : null;
    const requirements = existsSync(requirementsPath) ? readText(requirementsPath) : null;
    const projectName = pyproject?.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1];
    const runtimeVersion = readFirstExistingVersion(path, [".python-version"]);
    const framework = detectPythonFramework({ path, pyproject, requirements });
    const applicationShape = applicationShapeForFramework(framework);

    return {
      runtimeFamily: "python",
      ...(framework ? { framework } : {}),
      ...(applicationShape ? { applicationShape } : {}),
      packageManager: detectPythonPackageManager(path, pyproject),
      ...(runtimeVersion ? { runtimeVersion } : {}),
      ...(projectName ? { projectName } : {}),
      detectedFiles: pythonDetectedFiles(path),
      detectedScripts: [],
    };
  }
}

class JavaProjectProfileDetector implements LocalProjectProfileDetector {
  detect(path: string): LocalProjectProfile | null {
    const pomPath = join(path, "pom.xml");
    const gradlePath = join(path, "build.gradle");
    const gradleKtsPath = join(path, "build.gradle.kts");

    if (!existsSync(pomPath) && !existsSync(gradlePath) && !existsSync(gradleKtsPath)) {
      return null;
    }

    const pom = existsSync(pomPath) ? readText(pomPath) : null;
    const gradle = existsSync(gradlePath)
      ? readText(gradlePath)
      : existsSync(gradleKtsPath)
        ? readText(gradleKtsPath)
        : null;
    const projectName =
      pom?.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1] ??
      gradle?.match(/rootProject\.name\s*=\s*["']([^"']+)["']/)?.[1];
    const runtimeVersion = readFirstExistingVersion(path, [".java-version"]);

    return {
      runtimeFamily: "java",
      ...(runtimeVersion ? { runtimeVersion } : {}),
      ...(projectName ? { projectName } : {}),
      detectedFiles: [
        ...(existsSync(pomPath) ? ["pom-xml" as const] : []),
        ...(existsSync(gradlePath) || existsSync(gradleKtsPath) ? ["gradle-build" as const] : []),
        ...(existsSync(join(path, "mvnw")) ? ["maven-wrapper" as const] : []),
        ...(existsSync(join(path, "gradlew")) ? ["gradle-wrapper" as const] : []),
      ],
      detectedScripts: [],
    };
  }
}

const localProjectProfileDetectors: LocalProjectProfileDetector[] = [
  new NodeProjectProfileDetector(),
  new PythonProjectProfileDetector(),
  new JavaProjectProfileDetector(),
];

function detectLocalProjectProfile(path: string): LocalProjectProfile | null {
  for (const detector of localProjectProfileDetectors) {
    const profile = detector.detect(path);
    if (profile) {
      return profile;
    }
  }

  return null;
}

function detectLocalInspection(path: string): SourceInspectionSnapshot {
  const profile = detectLocalProjectProfile(path);
  const detectedFiles: SourceDetectedFile[] = [
    ...(existsSync(join(path, "Dockerfile")) ? ["dockerfile" as const] : []),
    ...(existsSync(join(path, "docker-compose.yml")) || existsSync(join(path, "compose.yml"))
      ? ["compose-manifest" as const]
      : []),
    ...(existsSync(join(path, ".git")) ? ["git-directory" as const] : []),
    ...(profile?.detectedFiles ?? []),
  ];

  return SourceInspectionSnapshot.rehydrate({
    ...(profile
      ? { runtimeFamily: SourceRuntimeFamilyValue.rehydrate(profile.runtimeFamily) }
      : {}),
    ...(profile?.framework ? { framework: SourceFrameworkValue.rehydrate(profile.framework) } : {}),
    ...(profile?.packageManager
      ? { packageManager: SourcePackageManagerValue.rehydrate(profile.packageManager) }
      : {}),
    ...(profile?.applicationShape
      ? { applicationShape: SourceApplicationShapeValue.rehydrate(profile.applicationShape) }
      : detectedFiles.includes("compose-manifest") || detectedFiles.includes("dockerfile")
        ? { applicationShape: SourceApplicationShapeValue.rehydrate("container-native") }
        : {}),
    ...(profile?.runtimeVersion
      ? { runtimeVersion: SourceRuntimeVersionText.rehydrate(profile.runtimeVersion) }
      : {}),
    ...(profile?.projectName
      ? { projectName: DisplayNameText.rehydrate(profile.projectName) }
      : {}),
    detectedFiles: detectedFiles.map((file) => SourceDetectedFileValue.rehydrate(file)),
    ...(profile?.detectedScripts
      ? {
          detectedScripts: profile.detectedScripts.map((script) =>
            SourceDetectedScriptValue.rehydrate(script),
          ),
        }
      : {}),
    dockerfilePath: FilePathText.rehydrate("Dockerfile"),
    ...(existsSync(join(path, "docker-compose.yml"))
      ? { composeFilePath: FilePathText.rehydrate("docker-compose.yml") }
      : existsSync(join(path, "compose.yml"))
        ? { composeFilePath: FilePathText.rehydrate("compose.yml") }
        : {}),
  });
}

function resolveSourceKind(locator: string): {
  kind: SourceKind;
  inspection?: SourceInspectionSnapshot;
} {
  if (/^(https?|ssh):\/\//.test(locator) || locator.endsWith(".git")) {
    return { kind: "git-public" };
  }

  if (locator.endsWith(".zip")) {
    return { kind: "zip-artifact" };
  }

  if (locator.startsWith("docker://") || locator.startsWith("image://")) {
    return { kind: "docker-image" };
  }

  if (locator.endsWith("docker-compose.yml") || locator.endsWith("compose.yml")) {
    return { kind: "compose" };
  }

  const absolutePath = resolve(locator);

  if (existsSync(absolutePath) && statSync(absolutePath).isDirectory()) {
    const inspection = detectLocalInspection(absolutePath);

    if (inspection.hasDetectedFile("compose-manifest")) {
      return { kind: "compose", inspection };
    }

    if (inspection.hasDetectedFile("git-directory")) {
      return { kind: "local-git", inspection };
    }

    return { kind: "local-folder", inspection };
  }

  return { kind: "local-folder" };
}

export class FileSystemSourceDetector implements SourceDetector {
  async detect(context: ExecutionContext, locator: string): Promise<Result<SourceDetectionResult>> {
    return context.tracer.startActiveSpan(
      createAdapterSpanName("filesystem_source_detector", "detect"),
      {
        attributes: {
          [appaloftTraceAttributes.sourceLocator]: locator,
        },
      },
      async () => {
        if (!locator.trim()) {
          return err(domainError.validation("Source locator is required"));
        }

        const absolutePath = resolve(locator);
        const resolved = resolveSourceKind(locator);
        const reasoning = [
          `Detected source kind: ${resolved.kind}`,
          resolved.inspection?.hasDetectedFile("dockerfile")
            ? "Dockerfile present in workspace"
            : "Dockerfile not detected",
          resolved.inspection?.hasDetectedFile("compose-manifest")
            ? "Compose manifest present in workspace"
            : "Compose manifest not detected",
        ];

        const source = SourceDescriptor.rehydrate({
          kind: SourceKindValue.rehydrate(resolved.kind),
          locator: SourceLocator.rehydrate(
            locator.startsWith(".") || locator.startsWith("/") ? absolutePath : locator,
          ),
          displayName: DisplayNameText.rehydrate(basename(locator) || basename(absolutePath)),
          ...(resolved.inspection ? { inspection: resolved.inspection } : {}),
        });

        return ok({ source, reasoning });
      },
    );
  }
}

function toDeploymentConfigSnapshot(
  config: AppaloftDeploymentConfig,
  configFilePath: string,
): DeploymentConfigSnapshot {
  const healthCheckPath =
    config.runtime?.healthCheckPath ?? config.runtime?.healthCheck?.path ?? config.health?.path;
  const deployment: NonNullable<DeploymentConfigSnapshot["deployment"]> = {
    ...(config.runtime?.strategy ? { method: config.runtime.strategy } : {}),
    ...(config.runtime?.installCommand ? { installCommand: config.runtime.installCommand } : {}),
    ...(config.runtime?.buildCommand ? { buildCommand: config.runtime.buildCommand } : {}),
    ...(config.runtime?.startCommand ? { startCommand: config.runtime.startCommand } : {}),
    ...(config.runtime?.publishDirectory
      ? { publishDirectory: config.runtime.publishDirectory }
      : {}),
    ...(config.network?.internalPort ? { port: config.network.internalPort } : {}),
    ...(config.network?.upstreamProtocol
      ? { upstreamProtocol: config.network.upstreamProtocol }
      : {}),
    ...(config.network?.exposureMode ? { exposureMode: config.network.exposureMode } : {}),
    ...(healthCheckPath ? { healthCheckPath } : {}),
  };

  return {
    configFilePath,
    ...(Object.keys(deployment).length > 0 ? { deployment } : {}),
  };
}

function resolveLocalSourceDirectory(sourceLocator: string): string | null {
  const absolutePath = resolve(sourceLocator);
  if (existsSync(absolutePath) && statSync(absolutePath).isDirectory()) {
    return absolutePath;
  }

  if (existsSync(absolutePath) && statSync(absolutePath).isFile()) {
    return dirname(absolutePath);
  }

  return null;
}

type ConfigFileResolution =
  | {
      kind: "found";
      path: string;
    }
  | {
      kind: "missing";
    }
  | {
      kind: "ambiguous";
      paths: string[];
    };

function resolveGitRoot(sourceDirectory: string): string | null {
  const git = Bun.spawnSync(["git", "-C", sourceDirectory, "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });

  if (!git.success) {
    return null;
  }

  const gitRoot = git.stdout.toString().trim();
  return gitRoot && existsSync(gitRoot) && statSync(gitRoot).isDirectory() ? gitRoot : null;
}

function findConfigFile(sourceLocator: string, configFilePath?: string): ConfigFileResolution {
  if (configFilePath) {
    const explicitPath = resolve(configFilePath);
    return existsSync(explicitPath) ? { kind: "found", path: explicitPath } : { kind: "missing" };
  }

  const sourceDirectory = resolveLocalSourceDirectory(sourceLocator);
  if (!sourceDirectory) {
    return { kind: "missing" };
  }

  const gitRoot = resolveGitRoot(sourceDirectory);
  const searchDirectories = [
    sourceDirectory,
    ...(gitRoot && gitRoot !== sourceDirectory ? [gitRoot] : []),
  ];
  const candidates = new Set<string>();

  for (const directory of searchDirectories) {
    for (const candidate of appaloftDeploymentConfigFileNames) {
      const path = join(directory, candidate);
      if (existsSync(path)) {
        candidates.add(path);
      }
    }
  }

  const paths = [...candidates];
  if (paths.length === 0) {
    return { kind: "missing" };
  }

  const [path] = paths;
  return paths.length === 1 && path ? { kind: "found", path } : { kind: "ambiguous", paths };
}

function inferConfigFromLocalSource(sourceLocator: string): DeploymentConfigSnapshot | null {
  const sourceDirectory = resolveLocalSourceDirectory(sourceLocator);
  if (!sourceDirectory) {
    return null;
  }

  const profile = detectLocalProjectProfile(sourceDirectory);
  if (!profile?.projectName) {
    return null;
  }

  return {
    project: {
      name: profile.projectName,
      description: `Inferred from ${profile.runtimeFamily} project metadata.`,
    },
  };
}

function phaseFromConfigIssues(issues: { message: string }[]): string {
  const messages = issues.map((issue) => issue.message).join("\n");

  if (messages.includes("config_identity_field")) {
    return "config-identity";
  }

  if (messages.includes("raw_secret_config_field")) {
    return "config-secret-validation";
  }

  if (messages.includes("unsupported_config_field")) {
    return "config-capability-resolution";
  }

  if (messages.includes("config_parse_error")) {
    return "config-parse";
  }

  return "config-schema";
}

export class FileSystemDeploymentConfigReader implements DeploymentConfigReader {
  async read(
    context: ExecutionContext,
    input: {
      sourceLocator: string;
      configFilePath?: string;
    },
  ): Promise<Result<DeploymentConfigSnapshot | null>> {
    return context.tracer.startActiveSpan(
      createAdapterSpanName("filesystem_deployment_config_reader", "read"),
      {
        attributes: {
          [appaloftTraceAttributes.sourceLocator]: input.sourceLocator,
        },
      },
      async () => {
        const configFile = findConfigFile(input.sourceLocator, input.configFilePath);
        const inferred = inferConfigFromLocalSource(input.sourceLocator);

        if (input.configFilePath && configFile.kind === "missing") {
          return err(
            domainError.validation("Deployment config file was not found", {
              phase: "config-discovery",
              configFilePath: input.configFilePath,
            }),
          );
        }

        if (configFile.kind === "ambiguous") {
          return err(
            domainError.validation("Multiple Appaloft deployment config files were found", {
              phase: "config-discovery",
              configFilePaths: configFile.paths.join(","),
            }),
          );
        }

        if (configFile.kind === "missing") {
          return ok(inferred);
        }

        const configFilePath = configFile.path;
        const text = readText(configFilePath);
        if (text === null) {
          return err(
            domainError.validation("Deployment config file could not be read", {
              phase: "config-read",
              configFilePath,
            }),
          );
        }

        const parsedConfig = parseAppaloftDeploymentConfigText(text, configFilePath);

        if (!parsedConfig.success) {
          return err(
            domainError.validation("Appaloft deployment config is invalid", {
              phase: phaseFromConfigIssues(parsedConfig.error.issues),
              configFilePath,
              issues: JSON.stringify(
                parsedConfig.error.issues.map((issue) => ({
                  path: issue.path.join("."),
                  message: issue.message,
                })),
              ),
            }),
          );
        }

        const config = toDeploymentConfigSnapshot(parsedConfig.data, configFilePath);
        return ok(config);
      },
    );
  }
}
