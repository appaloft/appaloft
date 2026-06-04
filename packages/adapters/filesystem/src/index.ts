import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import {
  mkdir,
  readdir as readDir,
  readFile as readFileBytes,
  stat as statPath,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { inflateRawSync } from "node:zlib";
import {
  type ActivateStaticArtifactRouteInput,
  appaloftTraceAttributes,
  createAdapterSpanName,
  type DeploymentConfigReader,
  type DeploymentConfigSnapshot,
  type ExecutionContext,
  type ListStaticArtifactPublicationsInput,
  type RecordStaticArtifactPublicationInput,
  type SourceDetectionResult,
  type SourceDetector,
  type SourceVersionDetectionResult,
  type SourceVersionDetector,
  type StaticArtifactFilePayload,
  type StaticArtifactPayloadReaderPort,
  type StaticArtifactPayloadReadResult,
  type StaticArtifactPublicationJournalPort,
  type StaticArtifactPublicationReadModelPort,
  type StaticArtifactPublicationSummary,
  type StaticArtifactRouteProviderPort,
  type StaticArtifactStorePort,
  type StoreStaticArtifactManifestInput,
} from "@appaloft/application";
import {
  DisplayNameText,
  domainError,
  err,
  FilePathText,
  ok,
  ProviderKey,
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
  StaticArtifactByteSize,
  StaticArtifactDigest,
  StaticArtifactFileCount,
  StaticArtifactFileDigest,
  StaticArtifactId,
  StaticArtifactManifest,
  StaticArtifactMimeType,
  StaticArtifactRouteActivation,
  StaticArtifactRouteUrl,
  StaticArtifactStorageRef,
  StaticArtifactStoredManifest,
  Version,
  VersionReference,
} from "@appaloft/core";
import {
  type AppaloftDeploymentConfig,
  appaloftDeploymentConfigFileNames,
  parseAppaloftDeploymentConfigText,
} from "@appaloft/deployment-config";

interface LocalProjectProfile {
  runtimeFamily: Extract<
    SourceRuntimeFamily,
    "dotnet" | "elixir" | "go" | "java" | "node" | "php" | "python" | "ruby" | "rust"
  >;
  framework?: SourceFramework;
  packageManager?: SourcePackageManager;
  applicationShape?: SourceApplicationShape;
  runtimeVersion?: string;
  projectName?: string;
  jarPath?: string;
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

function hasAnyFile(path: string, fileNames: readonly string[]): boolean {
  return fileNames.some((fileName) => existsSync(join(path, fileName)));
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

interface NodeFrameworkSignal {
  framework: SourceFramework;
  packages?: readonly string[];
  files?: readonly string[];
}

const nodeFrameworkSignals: readonly NodeFrameworkSignal[] = [
  {
    framework: "nextjs",
    packages: ["next"],
    files: ["next.config.js", "next.config.mjs", "next.config.ts"],
  },
  {
    framework: "sveltekit",
    packages: ["@sveltejs/kit"],
    files: ["svelte.config.js", "svelte.config.mjs", "svelte.config.ts"],
  },
  {
    framework: "nuxt",
    packages: ["nuxt"],
    files: ["nuxt.config.js", "nuxt.config.mjs", "nuxt.config.ts"],
  },
  {
    framework: "astro",
    packages: ["astro"],
    files: ["astro.config.mjs"],
  },
  {
    framework: "remix",
    packages: ["@remix-run/node", "@remix-run/react"],
    files: ["remix.config.js"],
  },
  {
    framework: "angular",
    packages: ["@angular/core"],
    files: ["angular.json"],
  },
  { framework: "react", packages: ["react"] },
  { framework: "vue", packages: ["vue"] },
  { framework: "svelte", packages: ["svelte"] },
  { framework: "solid", packages: ["solid-js"] },
  {
    framework: "vite",
    packages: ["vite"],
    files: ["vite.config.js", "vite.config.mjs", "vite.config.ts"],
  },
  { framework: "nestjs", packages: ["@nestjs/core"] },
  { framework: "fastify", packages: ["fastify"] },
  { framework: "hono", packages: ["hono"] },
  { framework: "koa", packages: ["koa"] },
  { framework: "express", packages: ["express"] },
];

function matchesNodeFrameworkSignal(input: {
  path: string;
  dependencies: Record<string, unknown>;
  devDependencies: Record<string, unknown>;
  signal: NodeFrameworkSignal;
}): boolean {
  return Boolean(
    (input.signal.packages &&
      hasAnyPackage(input.dependencies, input.devDependencies, input.signal.packages)) ||
      (input.signal.files && hasAnyFile(input.path, input.signal.files)),
  );
}

function detectNodeFramework(input: {
  path: string;
  dependencies: Record<string, unknown>;
  devDependencies: Record<string, unknown>;
}): SourceFramework | undefined {
  return nodeFrameworkSignals.find((signal) => matchesNodeFrameworkSignal({ ...input, signal }))
    ?.framework;
}

const frameworkApplicationShapes: Partial<Record<SourceFramework, SourceApplicationShape>> = {
  angular: "static",
  astro: "static",
  react: "static",
  solid: "static",
  svelte: "static",
  vite: "static",
  vue: "static",
  nextjs: "ssr",
  nuxt: "ssr",
  remix: "ssr",
  sveltekit: "hybrid-static-server",
  django: "serverful-http",
  express: "serverful-http",
  fastapi: "serverful-http",
  fastify: "serverful-http",
  flask: "serverful-http",
  hono: "serverful-http",
  koa: "serverful-http",
  nestjs: "serverful-http",
};

function applicationShapeForFramework(
  framework: SourceFramework | undefined,
): SourceApplicationShape | undefined {
  return framework ? frameworkApplicationShapes[framework] : undefined;
}

type NodeStaticShapePredicate = (input: {
  path: string;
  detectedScripts: SourceDetectedScript[];
}) => boolean;

const nodeStaticShapeOverrides: Partial<Record<SourceFramework, NodeStaticShapePredicate>> = {
  nextjs: (input) =>
    input.detectedScripts.includes("export") || hasNextStaticExportConfig(input.path),
  nuxt: (input) => input.detectedScripts.includes("generate"),
  sveltekit: (input) => hasSvelteKitStaticAdapter(input.path),
};

function applicationShapeForNodeProject(input: {
  path: string;
  framework: SourceFramework | undefined;
  detectedScripts: SourceDetectedScript[];
}): SourceApplicationShape | undefined {
  const staticOverride = input.framework ? nodeStaticShapeOverrides[input.framework] : undefined;
  if (staticOverride?.(input)) {
    return "static";
  }

  if (
    !input.framework &&
    (input.detectedScripts.includes("start") || input.detectedScripts.includes("start-built"))
  ) {
    return "serverful-http";
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

function hasNextStandaloneOutputConfig(path: string): boolean {
  const config = readFirstExistingText(path, [
    "next.config.js",
    "next.config.mjs",
    "next.config.ts",
  ]);

  return /\boutput\s*:\s*["']standalone["']/u.test(config ?? "");
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
    ...(existsSync(join(path, "app")) || existsSync(join(path, "src", "app"))
      ? ["next-app-router" as const]
      : []),
    ...(existsSync(join(path, "pages")) || existsSync(join(path, "src", "pages"))
      ? ["next-pages-router" as const]
      : []),
    ...(hasNextStandaloneOutputConfig(path) ? ["next-standalone-output" as const] : []),
    ...(hasNextStaticExportConfig(path) ? ["next-static-output" as const] : []),
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

function hasPythonWebEvidence(input: {
  path: string;
  pyproject: string | null;
  requirements: string | null;
  framework: SourceFramework | undefined;
}): boolean {
  if (input.framework) {
    return true;
  }

  const manifests = `${input.pyproject ?? ""}\n${input.requirements ?? ""}`;

  return (
    textMentionsPackage(manifests, "uvicorn") ||
    textMentionsPackage(manifests, "gunicorn") ||
    textMentionsPackage(manifests, "waitress") ||
    existsSync(join(input.path, "asgi.py")) ||
    existsSync(join(input.path, "wsgi.py"))
  );
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

function detectJavaFramework(input: {
  pom: string | null;
  gradle: string | null;
}): SourceFramework | undefined {
  const manifests = `${input.pom ?? ""}\n${input.gradle ?? ""}`;

  if (
    textMentionsPackage(manifests, "org.springframework.boot") ||
    manifests.includes("spring-boot-starter-web") ||
    manifests.includes("spring-boot-maven-plugin") ||
    /\bid\s*\(?\s*["']org\.springframework\.boot["']/u.test(manifests) ||
    /<groupId>\s*org\.springframework\.boot\s*<\/groupId>/u.test(manifests)
  ) {
    return "spring-boot";
  }

  if (
    textMentionsPackage(manifests, "io.quarkus") ||
    /<groupId>\s*io\.quarkus\s*<\/groupId>/u.test(manifests)
  ) {
    return "quarkus";
  }

  if (
    textMentionsPackage(manifests, "io.micronaut") ||
    /<groupId>\s*io\.micronaut/u.test(manifests)
  ) {
    return "micronaut";
  }

  return undefined;
}

function detectJavaPackageManager(input: {
  hasPom: boolean;
  hasGradle: boolean;
}): SourcePackageManager | undefined {
  if (input.hasPom === input.hasGradle) {
    return undefined;
  }

  return input.hasPom ? "maven" : "gradle";
}

function detectRubyFramework(gemfile: string | null): SourceFramework | undefined {
  if (textMentionsPackage(gemfile, "rails")) {
    return "rails";
  }

  if (textMentionsPackage(gemfile, "sinatra")) {
    return "sinatra";
  }

  return undefined;
}

function detectPhpFramework(
  composerJson: Record<string, unknown> | null,
): SourceFramework | undefined {
  const dependencies = stringRecord(composerJson?.require);
  const devDependencies = stringRecord(composerJson?.["require-dev"]);

  if (hasAnyPackage(dependencies, devDependencies, ["laravel/framework"])) {
    return "laravel";
  }

  if (
    hasAnyPackage(dependencies, devDependencies, [
      "symfony/framework-bundle",
      "symfony/http-kernel",
      "symfony/runtime",
    ])
  ) {
    return "symfony";
  }

  return undefined;
}

function detectGoFramework(goMod: string | null): SourceFramework | undefined {
  if (textMentionsPackage(goMod, "github.com/gin-gonic/gin")) {
    return "gin";
  }

  if (textMentionsPackage(goMod, "github.com/labstack/echo")) {
    return "echo";
  }

  if (textMentionsPackage(goMod, "github.com/gofiber/fiber")) {
    return "fiber";
  }

  if (textMentionsPackage(goMod, "github.com/go-chi/chi")) {
    return "chi";
  }

  return undefined;
}

function goModuleName(goMod: string | null): string | undefined {
  return goMod
    ?.match(/^\s*module\s+([^\s]+)\s*$/m)?.[1]
    ?.split("/")
    .at(-1);
}

function findSingleFileWithExtension(path: string, extension: string): string | undefined {
  const fileNames = readdirSync(path).filter((fileName) => {
    try {
      return statSync(join(path, fileName)).isFile() && fileName.endsWith(extension);
    } catch {
      return false;
    }
  });

  return fileNames.length === 1 ? fileNames[0] : undefined;
}

function detectDotnetProject(path: string): {
  fileName: string;
  text: string;
} | null {
  const fileName = findSingleFileWithExtension(path, ".csproj");
  if (!fileName) {
    return null;
  }

  const text = readText(join(path, fileName));
  return text === null ? null : { fileName, text };
}

function dotnetRuntimeVersion(csproj: string): string | undefined {
  const targetFramework = firstXmlText(csproj, "TargetFramework");
  const major = targetFramework?.match(/^net(\d+)\./u)?.[1];
  return major ? `${major}.0` : undefined;
}

function rustProjectName(cargoToml: string | null): string | undefined {
  return cargoToml?.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1];
}

function detectRustFramework(cargoToml: string | null): SourceFramework | undefined {
  if (textMentionsPackage(cargoToml, "axum")) {
    return "axum";
  }

  if (textMentionsPackage(cargoToml, "actix-web")) {
    return "actix-web";
  }

  if (textMentionsPackage(cargoToml, "rocket")) {
    return "rocket";
  }

  return undefined;
}

function elixirProjectName(mixExs: string | null): string | undefined {
  return mixExs?.match(/\bapp:\s*:([a-zA-Z0-9_]+)/u)?.[1];
}

function detectElixirFramework(mixExs: string | null): SourceFramework | undefined {
  return textMentionsPackage(mixExs, "phoenix") || /\{:phoenix,/u.test(mixExs ?? "")
    ? "phoenix"
    : undefined;
}

function firstXmlText(text: string | null, tag: string): string | undefined {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return text?.match(new RegExp(`<${escaped}>\\s*([^<]+?)\\s*</${escaped}>`, "u"))?.[1];
}

function gradleStringAssignment(text: string | null, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return text?.match(new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']+)["']`, "u"))?.[1];
}

function gradleProjectName(input: {
  buildText: string | null;
  settingsText: string | null;
}): string | undefined {
  return (
    gradleStringAssignment(input.settingsText, "rootProject.name") ??
    gradleStringAssignment(input.buildText, "rootProject.name")
  );
}

function findSingleJarUnder(path: string, directoryName: string): string | undefined {
  const directoryPath = join(path, directoryName);

  if (!existsSync(directoryPath)) {
    return undefined;
  }

  const jarFiles = readdirSync(directoryPath)
    .filter((fileName) => fileName.endsWith(".jar"))
    .filter(
      (fileName) =>
        !/(?:^|[-.])(plain|sources|javadoc|tests?)(?:[-.]|$)/u.test(fileName.toLowerCase()),
    );

  return jarFiles.length === 1 ? `${directoryName}/${jarFiles[0]}` : undefined;
}

function deterministicJavaJarPath(input: {
  path: string;
  framework?: SourceFramework;
  packageManager?: SourcePackageManager;
  projectName?: string;
  version?: string;
}): string | undefined {
  if (input.framework === "quarkus") {
    return input.packageManager === "gradle"
      ? "build/quarkus-app/quarkus-run.jar"
      : "target/quarkus-app/quarkus-run.jar";
  }

  const explicitJar =
    findSingleJarUnder(input.path, "target") ?? findSingleJarUnder(input.path, "build/libs");

  if (explicitJar) {
    return explicitJar;
  }

  if (!input.projectName || !input.version) {
    return undefined;
  }

  return input.packageManager === "gradle"
    ? `build/libs/${input.projectName}-${input.version}.jar`
    : `target/${input.projectName}-${input.version}.jar`;
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
    const applicationShape = hasPythonWebEvidence({ path, pyproject, requirements, framework })
      ? "serverful-http"
      : applicationShapeForFramework(framework);

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
    const gradleSettingsPath = join(path, "settings.gradle");
    const gradleSettingsKtsPath = join(path, "settings.gradle.kts");
    const hasPom = existsSync(pomPath);
    const hasGradle = existsSync(gradlePath) || existsSync(gradleKtsPath);
    const hasJar = Boolean(
      findSingleJarUnder(path, "target") ?? findSingleJarUnder(path, "build/libs"),
    );
    const hasJavaVersion = existsSync(join(path, ".java-version"));
    const hasJavaSources = existsSync(join(path, "src", "main", "java"));

    if (!hasPom && !hasGradle && !hasJar && !hasJavaVersion && !hasJavaSources) {
      return null;
    }

    const pom = hasPom ? readText(pomPath) : null;
    const gradle = existsSync(gradlePath)
      ? readText(gradlePath)
      : existsSync(gradleKtsPath)
        ? readText(gradleKtsPath)
        : null;
    const gradleSettings = existsSync(gradleSettingsPath)
      ? readText(gradleSettingsPath)
      : existsSync(gradleSettingsKtsPath)
        ? readText(gradleSettingsKtsPath)
        : null;
    const packageManager = detectJavaPackageManager({ hasPom, hasGradle });
    const projectName =
      firstXmlText(pom, "artifactId") ??
      gradleProjectName({
        buildText: gradle,
        settingsText: gradleSettings,
      });
    const version = firstXmlText(pom, "version") ?? gradleStringAssignment(gradle, "version");
    const runtimeVersion = readFirstExistingVersion(path, [".java-version"]);
    const framework = detectJavaFramework({ pom, gradle });
    const jarPath = deterministicJavaJarPath({
      path,
      ...(framework ? { framework } : {}),
      ...(packageManager ? { packageManager } : {}),
      ...(projectName ? { projectName } : {}),
      ...(version ? { version } : {}),
    });

    return {
      runtimeFamily: "java",
      ...(framework ? { framework } : {}),
      ...(packageManager ? { packageManager } : {}),
      applicationShape: "serverful-http",
      ...(runtimeVersion ? { runtimeVersion } : {}),
      ...(projectName ? { projectName } : {}),
      ...(jarPath ? { jarPath } : {}),
      detectedFiles: [
        ...(hasPom ? ["pom-xml" as const] : []),
        ...(hasGradle ? ["gradle-build" as const] : []),
        ...(existsSync(gradleKtsPath) ? ["gradle-kotlin-build" as const] : []),
        ...(existsSync(join(path, "mvnw")) ? ["maven-wrapper" as const] : []),
        ...(existsSync(join(path, "gradlew")) ? ["gradle-wrapper" as const] : []),
        ...(jarPath ? ["jvm-runnable-jar" as const] : []),
        ...(`${pom ?? ""}\n${gradle ?? ""}`.includes("spring-boot-starter-actuator")
          ? ["spring-boot-actuator" as const]
          : []),
      ],
      detectedScripts: [],
    };
  }
}

class RubyProjectProfileDetector implements LocalProjectProfileDetector {
  detect(path: string): LocalProjectProfile | null {
    const gemfilePath = join(path, "Gemfile");
    if (!existsSync(gemfilePath)) {
      return null;
    }

    const gemfile = readText(gemfilePath);
    const framework = detectRubyFramework(gemfile);
    const runtimeVersion = readFirstExistingVersion(path, [".ruby-version"]);

    return {
      runtimeFamily: "ruby",
      ...(framework ? { framework } : {}),
      applicationShape: "serverful-http",
      ...(runtimeVersion ? { runtimeVersion } : {}),
      ...(framework ? { projectName: basename(path) } : {}),
      detectedFiles: [],
      detectedScripts: [],
    };
  }
}

class PhpProjectProfileDetector implements LocalProjectProfileDetector {
  detect(path: string): LocalProjectProfile | null {
    const composerPath = join(path, "composer.json");
    if (!existsSync(composerPath)) {
      return null;
    }

    const composerJson = readJsonObject(composerPath);
    const framework = detectPhpFramework(composerJson);
    const projectName =
      typeof composerJson?.name === "string" ? composerJson.name.split("/").at(-1) : undefined;

    return {
      runtimeFamily: "php",
      ...(framework ? { framework } : {}),
      packageManager: "composer",
      applicationShape: "serverful-http",
      ...(projectName ? { projectName } : {}),
      detectedFiles: ["composer-json"],
      detectedScripts: [],
    };
  }
}

class GoProjectProfileDetector implements LocalProjectProfileDetector {
  detect(path: string): LocalProjectProfile | null {
    const goModPath = join(path, "go.mod");
    if (!existsSync(goModPath)) {
      return null;
    }

    const goMod = readText(goModPath);
    const framework = detectGoFramework(goMod);
    const runtimeVersion = readFirstExistingVersion(path, [".go-version"]);
    const projectName = goModuleName(goMod);

    return {
      runtimeFamily: "go",
      ...(framework ? { framework } : {}),
      packageManager: "go",
      applicationShape: "serverful-http",
      ...(runtimeVersion ? { runtimeVersion } : {}),
      ...(projectName ? { projectName } : {}),
      detectedFiles: ["go-mod"],
      detectedScripts: [],
    };
  }
}

class DotnetProjectProfileDetector implements LocalProjectProfileDetector {
  detect(path: string): LocalProjectProfile | null {
    const project = detectDotnetProject(path);
    if (!project) {
      return null;
    }

    const isAspnetCore =
      /<Project\s+Sdk=["']Microsoft\.NET\.Sdk\.Web["']/u.test(project.text) ||
      project.text.includes("Microsoft.AspNetCore.App");
    const runtimeVersion = dotnetRuntimeVersion(project.text);

    return {
      runtimeFamily: "dotnet",
      ...(isAspnetCore ? { framework: "aspnet-core" } : {}),
      packageManager: "dotnet",
      applicationShape: "serverful-http",
      ...(runtimeVersion ? { runtimeVersion } : {}),
      projectName: project.fileName.replace(/\.csproj$/u, ""),
      detectedFiles: ["csproj"],
      detectedScripts: [],
    };
  }
}

class RustProjectProfileDetector implements LocalProjectProfileDetector {
  detect(path: string): LocalProjectProfile | null {
    const cargoTomlPath = join(path, "Cargo.toml");
    if (!existsSync(cargoTomlPath)) {
      return null;
    }

    const cargoToml = readText(cargoTomlPath);
    const framework = detectRustFramework(cargoToml);
    const runtimeVersion = readFirstExistingVersion(path, ["rust-toolchain"]);
    const projectName = rustProjectName(cargoToml);

    return {
      runtimeFamily: "rust",
      ...(framework ? { framework } : {}),
      packageManager: "cargo",
      applicationShape: "serverful-http",
      ...(runtimeVersion ? { runtimeVersion } : {}),
      ...(projectName ? { projectName } : {}),
      detectedFiles: ["cargo-toml"],
      detectedScripts: [],
    };
  }
}

class ElixirProjectProfileDetector implements LocalProjectProfileDetector {
  detect(path: string): LocalProjectProfile | null {
    const mixExsPath = join(path, "mix.exs");
    if (!existsSync(mixExsPath)) {
      return null;
    }

    const mixExs = readText(mixExsPath);
    const framework = detectElixirFramework(mixExs);
    const runtimeVersion = readFirstExistingVersion(path, [".tool-versions"]);
    const projectName = elixirProjectName(mixExs);

    return {
      runtimeFamily: "elixir",
      ...(framework ? { framework } : {}),
      packageManager: "mix",
      applicationShape: "serverful-http",
      ...(runtimeVersion ? { runtimeVersion } : {}),
      ...(projectName ? { projectName } : {}),
      detectedFiles: ["mix-exs"],
      detectedScripts: [],
    };
  }
}

const localProjectProfileDetectors: LocalProjectProfileDetector[] = [
  new NodeProjectProfileDetector(),
  new PythonProjectProfileDetector(),
  new JavaProjectProfileDetector(),
  new RubyProjectProfileDetector(),
  new PhpProjectProfileDetector(),
  new GoProjectProfileDetector(),
  new DotnetProjectProfileDetector(),
  new RustProjectProfileDetector(),
  new ElixirProjectProfileDetector(),
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
    ...(profile?.jarPath ? { jarPath: FilePathText.rehydrate(profile.jarPath) } : {}),
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

export interface SourceVersionCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type SourceVersionCommandRunner = (
  command: string[],
  options?: { cwd?: string },
) => Promise<SourceVersionCommandResult>;

async function defaultSourceVersionCommandRunner(
  command: string[],
  options: { cwd?: string } = {},
): Promise<SourceVersionCommandResult> {
  const subprocess = Bun.spawn(command, {
    ...(options.cwd ? { cwd: options.cwd } : {}),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
    subprocess.exited,
  ]);

  return { exitCode, stdout, stderr };
}

function commandSucceeded(result: SourceVersionCommandResult): boolean {
  return result.exitCode === 0;
}

function firstGitSha(output: string): string | undefined {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim().match(/^([0-9a-f]{40})(?:\s|$)/i)?.[1])
    .find((value): value is string => Boolean(value));
}

function gitRefPatterns(referenceKind: string | undefined, value: string): string[] {
  const normalized = value.replace(/^refs\/heads\//, "").replace(/^refs\/tags\//, "");

  if (referenceKind === "tag" || referenceKind === "release") {
    return [`refs/tags/${normalized}^{}`, `refs/tags/${normalized}`, normalized];
  }

  if (referenceKind === "branch") {
    return [`refs/heads/${normalized}`, normalized];
  }

  return [
    `refs/heads/${normalized}`,
    `refs/tags/${normalized}^{}`,
    `refs/tags/${normalized}`,
    normalized,
  ];
}

function repoDigestFromDockerInspect(output: string): string | undefined {
  const trimmed = output.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.match(/@(sha256:[0-9a-f]{64})$/i)?.[1])
        .find((digest): digest is string => Boolean(digest));
    }
  } catch {
    const digest = trimmed.match(/@(sha256:[0-9a-f]{64})/i)?.[1];
    if (digest) {
      return digest;
    }
  }

  return undefined;
}

function imageReferenceForVersion(input: {
  sourceLocator: string;
  metadata?: Record<string, string>;
  requestedVersion?: VersionReference;
}): string {
  if (input.requestedVersion?.referenceKind === "image-tag") {
    return input.metadata?.imageName
      ? `${input.metadata.imageName}:${input.requestedVersion.value}`
      : input.sourceLocator;
  }

  return input.sourceLocator;
}

export class FileSystemSourceVersionDetector implements SourceVersionDetector {
  constructor(
    private readonly runCommand: SourceVersionCommandRunner = defaultSourceVersionCommandRunner,
  ) {}

  async detect(
    context: ExecutionContext,
    input: Parameters<SourceVersionDetector["detect"]>[1],
  ): Promise<Result<SourceVersionDetectionResult>> {
    return context.tracer.startActiveSpan(
      createAdapterSpanName("filesystem_source_version_detector", "detect"),
      {
        attributes: {
          [appaloftTraceAttributes.sourceLocator]: input.source.locator,
        },
      },
      async () => {
        if (input.source.kind === "git-public" || input.source.kind === "remote-git") {
          return this.detectRemoteGit(input);
        }

        if (input.source.kind === "local-git") {
          return this.detectLocalGit(input);
        }

        if (input.source.kind === "docker-image") {
          return this.detectDockerImage(input);
        }

        return this.detectFromCore(input);
      },
    );
  }

  private detectFromCore(
    input: Parameters<SourceVersionDetector["detect"]>[1],
  ): Result<SourceVersionDetectionResult> {
    return input.source.resolveVersion({
      ...(input.requestedVersion ? { requestedVersion: input.requestedVersion } : {}),
    });
  }

  private async detectRemoteGit(
    input: Parameters<SourceVersionDetector["detect"]>[1],
  ): Promise<Result<SourceVersionDetectionResult>> {
    if (input.requestedVersion?.isImmutable()) {
      return this.detectFromCore(input);
    }

    const metadata = input.source.metadata ?? {};
    const ref = input.requestedVersion?.value ?? metadata.gitRef ?? metadata.defaultBranch;
    if (!ref) {
      return this.detectFromCore(input);
    }

    for (const pattern of gitRefPatterns(input.requestedVersion?.referenceKind, ref)) {
      const result = await this.runCommand(["git", "ls-remote", input.source.locator, pattern]);
      const commitSha = commandSucceeded(result) ? firstGitSha(result.stdout) : undefined;
      if (commitSha) {
        return this.fixedGitVersion(input, commitSha, ref);
      }
    }

    return this.detectFromCore(input);
  }

  private async detectLocalGit(
    input: Parameters<SourceVersionDetector["detect"]>[1],
  ): Promise<Result<SourceVersionDetectionResult>> {
    if (input.requestedVersion?.isImmutable()) {
      return this.detectFromCore(input);
    }

    const metadata = input.source.metadata ?? {};
    const ref = input.requestedVersion?.value ?? metadata.gitRef ?? "HEAD";
    const result = await this.runCommand([
      "git",
      "-C",
      input.source.locator,
      "rev-parse",
      `${ref}^{commit}`,
    ]);
    const commitSha = commandSucceeded(result) ? firstGitSha(result.stdout) : undefined;

    return commitSha ? this.fixedGitVersion(input, commitSha, ref) : this.detectFromCore(input);
  }

  private fixedGitVersion(
    input: Parameters<SourceVersionDetector["detect"]>[1],
    commitSha: string,
    ref: string,
  ): Result<SourceVersionDetectionResult> {
    const referenceResult = input.requestedVersion
      ? ok(input.requestedVersion)
      : VersionReference.createForSource({
          sourceKind: "git",
          value: ref,
        });
    if (referenceResult.isErr()) {
      return err(referenceResult.error);
    }

    return VersionReference.createDetected({
      sourceKind: "git",
      referenceKind: "commit-sha",
      value: commitSha,
    }).andThen((fixedIdentifier) =>
      Version.fixed({
        reference: referenceResult.value,
        fixedIdentifier,
        aliases: input.requestedVersion ? [input.requestedVersion] : [],
      }).map((version) => ({
        version,
        reasoning: ["Resolved fixed Git version with git command"],
      })),
    );
  }

  private async detectDockerImage(
    input: Parameters<SourceVersionDetector["detect"]>[1],
  ): Promise<Result<SourceVersionDetectionResult>> {
    if (input.requestedVersion?.isImmutable()) {
      return this.detectFromCore(input);
    }

    const image = imageReferenceForVersion({
      sourceLocator: input.source.locator,
      ...(input.source.metadata ? { metadata: input.source.metadata } : {}),
      ...(input.requestedVersion ? { requestedVersion: input.requestedVersion } : {}),
    });
    const pull = await this.runCommand(["docker", "pull", image]);
    const inspect = await this.runCommand([
      "docker",
      "image",
      "inspect",
      "--format",
      "{{json .RepoDigests}}",
      image,
    ]);
    let digest = commandSucceeded(inspect)
      ? repoDigestFromDockerInspect(inspect.stdout)
      : undefined;

    if (!digest && !commandSucceeded(pull)) {
      const localInspect = await this.runCommand([
        "docker",
        "image",
        "inspect",
        "--format",
        "{{json .RepoDigests}}",
        input.source.locator,
      ]);
      digest = commandSucceeded(localInspect)
        ? repoDigestFromDockerInspect(localInspect.stdout)
        : undefined;
    }

    if (!digest) {
      return this.detectFromCore(input);
    }

    return VersionReference.createDetected({
      sourceKind: "docker-image",
      referenceKind: "image-digest",
      value: digest,
    }).andThen((fixedIdentifier) =>
      Version.fixed({
        reference: input.requestedVersion ?? fixedIdentifier,
        fixedIdentifier,
        aliases: input.requestedVersion ? [input.requestedVersion] : [],
      }).map((version) => ({
        version,
        reasoning: ["Resolved fixed Docker image version with docker image inspect"],
      })),
    );
  }
}

function toDeploymentConfigSnapshot(
  config: AppaloftDeploymentConfig,
  configFilePath: string,
): DeploymentConfigSnapshot {
  const healthCheckPath =
    config.runtime?.healthCheckPath ?? config.runtime?.healthCheck?.path ?? config.health?.path;
  const runtimePrune = config.retention?.runtimePrune;
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
    ...(config.network?.hostPort ? { hostPort: config.network.hostPort } : {}),
    ...(healthCheckPath ? { healthCheckPath } : {}),
  };

  return {
    configFilePath,
    ...(Object.keys(deployment).length > 0 ? { deployment } : {}),
    ...(runtimePrune ? { retention: { runtimePrune } } : {}),
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

export interface FileSystemStaticArtifactStoreOptions {
  rootPath: string;
  providerKey?: string;
}

export class FileSystemStaticArtifactPayloadReader implements StaticArtifactPayloadReaderPort {
  async read(
    _context: ExecutionContext,
    input: {
      artifactId: string;
      sourcePath: string;
      metadata?: Record<string, string> | undefined;
    },
  ): Promise<Result<StaticArtifactPayloadReadResult>> {
    const sourceRoot = resolve(input.sourcePath);
    let sourceStats: Awaited<ReturnType<typeof statPath>>;
    try {
      sourceStats = await statPath(sourceRoot);
    } catch {
      return err(
        domainError.validation("Static artifact source path was not found", {
          sourcePath: input.sourcePath,
        }),
      );
    }

    if (sourceStats.isFile() && sourceRoot.toLowerCase().endsWith(".zip")) {
      return readStaticArtifactPayloads(input.artifactId, sourceRoot, "archive");
    }

    if (!sourceStats.isDirectory()) {
      return err(
        domainError.validation("Static artifact source path must be a directory or .zip archive", {
          sourcePath: input.sourcePath,
        }),
      );
    }

    const filePaths = await listStaticArtifactFiles(sourceRoot);
    if (filePaths.isErr()) return err(filePaths.error);
    if (filePaths.value.length === 0) {
      return err(
        domainError.validation("Static artifact source directory must contain at least one file", {
          sourcePath: input.sourcePath,
        }),
      );
    }

    return readStaticArtifactPayloads(input.artifactId, sourceRoot, "directory", filePaths.value);
  }
}

export class FileSystemStaticArtifactStore implements StaticArtifactStorePort {
  private readonly rootPath: string;
  private readonly providerKey: string;

  constructor(options: FileSystemStaticArtifactStoreOptions) {
    this.rootPath = resolve(options.rootPath);
    this.providerKey = options.providerKey ?? "filesystem-static-artifact-store";
  }

  async storeManifest(
    _context: ExecutionContext,
    input: StoreStaticArtifactManifestInput,
  ): Promise<Result<StaticArtifactStoredManifest>> {
    const manifestState = input.manifest.toState();
    const artifactId = manifestState.artifactId.value;
    const manifestDigest = manifestState.manifestDigest.value;
    const artifactRoot = resolveChild(this.rootPath, [artifactId, manifestDigest]);
    if (artifactRoot.isErr()) return err(artifactRoot.error);

    const payloadValidation = validateStaticArtifactPayloads(input);
    if (payloadValidation.isErr()) return err(payloadValidation.error);

    try {
      await mkdir(artifactRoot.value, { recursive: true });
      await writeStaticArtifactFiles(artifactRoot.value, input.files ?? []);
      await writeFile(
        join(artifactRoot.value, "manifest.json"),
        `${JSON.stringify(
          {
            schemaVersion: "appaloft-filesystem-static-artifact-store/v1",
            projectId: input.projectId,
            resourceId: input.resourceId,
            artifactId,
            manifestDigest,
            fileCount: manifestState.fileCount.value,
            totalBytes: manifestState.totalBytes.value,
            files: manifestState.files.map((file) => {
              const fileState = file.toState();
              return {
                pathDigest: fileState.pathDigest.value,
                contentDigest: fileState.contentDigest.value,
                sizeBytes: fileState.sizeBytes.value,
                mimeType: fileState.mimeType.value,
              };
            }),
            metadata: input.metadata ?? {},
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
    } catch (error) {
      return err(
        domainError.provider("Static artifact filesystem store failed", {
          rootPath: this.rootPath,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }

    return StaticArtifactStoredManifest.create({
      artifactId: manifestState.artifactId,
      manifestDigest: manifestState.manifestDigest,
      storageRef: StaticArtifactStorageRef.rehydrate(
        `filesystem-static-artifact://${artifactId}/${manifestDigest}`,
      ),
      providerKey: ProviderKey.rehydrate(this.providerKey),
    });
  }
}

export class FileSystemStaticArtifactPublicationJournal
  implements StaticArtifactPublicationJournalPort, StaticArtifactPublicationReadModelPort
{
  private readonly rootPath: string;

  constructor(options: FileSystemStaticArtifactStoreOptions) {
    this.rootPath = resolve(options.rootPath);
  }

  async recordPublication(
    _context: ExecutionContext,
    input: RecordStaticArtifactPublicationInput,
  ): Promise<Result<StaticArtifactPublicationSummary>> {
    const summary = staticArtifactPublicationSummary(input);
    const publicationPath = resolveChild(this.rootPath, [
      "publications",
      `${summary.publicationId}.json`,
    ]);
    if (publicationPath.isErr()) return err(publicationPath.error);

    try {
      await mkdir(dirname(publicationPath.value), { recursive: true });
      await writeFile(
        publicationPath.value,
        `${JSON.stringify(
          {
            schemaVersion: "appaloft-filesystem-static-artifact-publication/v1",
            ...summary,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      return ok(summary);
    } catch (error) {
      return err(
        domainError.provider("Static artifact filesystem publication journal failed", {
          rootPath: this.rootPath,
          publicationId: summary.publicationId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  async listPublications(
    _context: ExecutionContext,
    input: ListStaticArtifactPublicationsInput = {},
  ): Promise<Result<{ items: StaticArtifactPublicationSummary[] }>> {
    const publicationsRoot = resolveChild(this.rootPath, ["publications"]);
    if (publicationsRoot.isErr()) return err(publicationsRoot.error);

    try {
      const entries = await readDir(publicationsRoot.value, { withFileTypes: true }).catch(
        (error: unknown) => {
          if (isNodeErrorCode(error, "ENOENT")) return [];
          throw error;
        },
      );
      const items = (
        await Promise.all(
          entries
            .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
            .map(async (entry) =>
              readStaticArtifactPublicationSummary(join(publicationsRoot.value, entry.name)),
            ),
        )
      )
        .filter((item): item is StaticArtifactPublicationSummary => item !== undefined)
        .filter((item) => !input.projectId || item.projectId === input.projectId)
        .filter((item) => !input.resourceId || item.resourceId === input.resourceId)
        .sort(compareStaticArtifactPublicationSummaries)
        .slice(0, input.limit ?? 50);

      return ok({ items });
    } catch (error) {
      return err(
        domainError.provider("Static artifact filesystem publication read model failed", {
          rootPath: this.rootPath,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}

function staticArtifactPublicationSummary(
  input: RecordStaticArtifactPublicationInput,
): StaticArtifactPublicationSummary {
  const publicationState = input.publication.toState();
  const manifestState = publicationState.manifest.toState();
  const storedManifestState = publicationState.storedManifest.toState();
  const routeActivationState = publicationState.routeActivation?.toState();

  return {
    publicationId: publicationState.publicationId.value,
    projectId: publicationState.projectId.value,
    resourceId: publicationState.resourceId.value,
    artifactId: manifestState.artifactId.value,
    manifestDigest: manifestState.manifestDigest.value,
    storageRef: storedManifestState.storageRef.value,
    storeProviderKey: storedManifestState.providerKey.value,
    ...(routeActivationState
      ? {
          routeUrl: routeActivationState.url.value,
          routeProviderKey: routeActivationState.providerKey.value,
        }
      : {}),
    fileCount: manifestState.fileCount.value,
    totalBytes: manifestState.totalBytes.value,
    publishedAt: input.publishedAt ?? new Date().toISOString(),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

async function readStaticArtifactPublicationSummary(
  path: string,
): Promise<StaticArtifactPublicationSummary | undefined> {
  const raw = JSON.parse((await readFileBytes(path)).toString("utf8")) as {
    readonly schemaVersion?: string;
  } & StaticArtifactPublicationSummary;
  if (raw.schemaVersion !== "appaloft-filesystem-static-artifact-publication/v1") {
    return undefined;
  }

  return {
    publicationId: raw.publicationId,
    projectId: raw.projectId,
    resourceId: raw.resourceId,
    artifactId: raw.artifactId,
    manifestDigest: raw.manifestDigest,
    storageRef: raw.storageRef,
    storeProviderKey: raw.storeProviderKey,
    ...(raw.routeUrl ? { routeUrl: raw.routeUrl } : {}),
    ...(raw.routeProviderKey ? { routeProviderKey: raw.routeProviderKey } : {}),
    fileCount: raw.fileCount,
    totalBytes: raw.totalBytes,
    ...(raw.publishedAt ? { publishedAt: raw.publishedAt } : {}),
    ...(raw.metadata ? { metadata: raw.metadata } : {}),
  };
}

function compareStaticArtifactPublicationSummaries(
  left: StaticArtifactPublicationSummary,
  right: StaticArtifactPublicationSummary,
): number {
  return (
    (right.publishedAt ?? "").localeCompare(left.publishedAt ?? "") ||
    right.publicationId.localeCompare(left.publicationId)
  );
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === code
  );
}

export interface FileSystemStaticArtifactRouteProviderOptions {
  baseUrl: string;
  providerKey?: string;
  rootPath?: string;
}

export class FileSystemStaticArtifactRouteProvider implements StaticArtifactRouteProviderPort {
  private readonly baseUrl: string;
  private readonly providerKey: string;
  private readonly rootPath: string | undefined;

  constructor(options: FileSystemStaticArtifactRouteProviderOptions) {
    this.baseUrl = trimTrailingSlash(options.baseUrl);
    this.providerKey = options.providerKey ?? "filesystem-static-artifact-route";
    this.rootPath = options.rootPath ? resolve(options.rootPath) : undefined;
  }

  async activateRoute(
    _context: ExecutionContext,
    input: ActivateStaticArtifactRouteInput,
  ): Promise<Result<StaticArtifactRouteActivation>> {
    const publicationState = input.publication.toState();
    const manifestState = publicationState.manifest.toState();
    const artifactId = manifestState.artifactId.value;
    const manifestDigest = manifestState.manifestDigest.value;
    const projectId = publicationState.projectId.value;
    const resourceId = publicationState.resourceId.value;
    if (input.routeKind === "alias" && this.rootPath) {
      const alias = await writeStaticArtifactAlias(this.rootPath, {
        artifactId,
        manifestDigest,
        projectId,
        publicationId: publicationState.publicationId.value,
        resourceId,
      });
      if (alias.isErr()) return err(alias.error);
    }

    const routeUrl =
      input.routeKind === "alias"
        ? `${this.baseUrl}/projects/${encodeURIComponent(projectId)}/resources/${encodeURIComponent(resourceId)}/current/`
        : `${this.baseUrl}/artifacts/${encodeURIComponent(artifactId)}/${encodeURIComponent(manifestDigest)}/`;
    const url = StaticArtifactRouteUrl.create(routeUrl);
    if (url.isErr()) return err(url.error);

    return StaticArtifactRouteActivation.create({
      publicationId: publicationState.publicationId,
      url: url.value,
      providerKey: ProviderKey.rehydrate(this.providerKey),
    });
  }
}

async function writeStaticArtifactAlias(
  rootPath: string,
  input: {
    artifactId: string;
    manifestDigest: string;
    projectId: string;
    publicationId: string;
    resourceId: string;
  },
): Promise<Result<undefined>> {
  const aliasPath = resolveChild(rootPath, [
    "aliases",
    "projects",
    encodeURIComponent(input.projectId),
    "resources",
    encodeURIComponent(input.resourceId),
    "current.json",
  ]);
  if (aliasPath.isErr()) return err(aliasPath.error);

  try {
    await mkdir(dirname(aliasPath.value), { recursive: true });
    await writeFile(
      aliasPath.value,
      `${JSON.stringify(
        {
          schemaVersion: "appaloft-filesystem-static-artifact-alias/v1",
          projectId: input.projectId,
          resourceId: input.resourceId,
          publicationId: input.publicationId,
          artifactId: input.artifactId,
          manifestDigest: input.manifestDigest,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    return ok(undefined);
  } catch (error) {
    return err(
      domainError.provider("Static artifact filesystem alias activation failed", {
        rootPath,
        projectId: input.projectId,
        resourceId: input.resourceId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

function validateStaticArtifactPayloads(
  input: StoreStaticArtifactManifestInput,
): Result<undefined> {
  if (!input.files) return ok(undefined);

  const manifestFiles = input.manifest.toState().files.map((file) => file.toState());
  if (input.files.length !== manifestFiles.length) {
    return err(
      domainError.validation("Static artifact file payload count must match manifest file count", {
        filePayloadCount: input.files.length,
        manifestFileCount: manifestFiles.length,
      }),
    );
  }

  for (const payload of input.files) {
    const matchingManifestFile = manifestFiles.find(
      (file) =>
        file.contentDigest.value === payload.contentDigest &&
        file.sizeBytes.value === payload.sizeBytes &&
        file.mimeType.value === payload.mimeType,
    );
    if (!matchingManifestFile) {
      return err(
        domainError.validation("Static artifact file payload must match manifest digest metadata", {
          path: payload.path,
          contentDigest: payload.contentDigest,
        }),
      );
    }
  }

  return ok(undefined);
}

async function listStaticArtifactFiles(sourceRoot: string): Promise<Result<string[]>> {
  const files: string[] = [];

  async function visit(directoryPath: string): Promise<void> {
    const entries = await readDir(directoryPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
        continue;
      }
      if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }

  try {
    await visit(sourceRoot);
  } catch (error) {
    return err(
      domainError.provider("Static artifact source directory could not be read", {
        sourcePath: sourceRoot,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  return ok(files.sort());
}

async function readStaticArtifactPayloads(
  artifactId: string,
  sourcePath: string,
  sourceKind: "archive" | "directory",
  filePaths?: readonly string[],
): Promise<Result<StaticArtifactPayloadReadResult>> {
  try {
    const payloads =
      sourceKind === "archive"
        ? await createStaticArtifactPayloadsFromZip(sourcePath)
        : ok(
            await Promise.all(
              (filePaths ?? []).map(async (path) => createStaticArtifactPayload(sourcePath, path)),
            ),
          );
    if (payloads.isErr()) return err(payloads.error);

    return createStaticArtifactPayloadReadResult(artifactId, payloads.value);
  } catch (error) {
    return err(
      domainError.provider("Static artifact filesystem payload read failed", {
        sourcePath,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

function createStaticArtifactPayloadReadResult(
  artifactId: string,
  payloads: readonly StaticArtifactFilePayload[],
): Result<StaticArtifactPayloadReadResult> {
  const orderedPayloads = [...payloads].sort((left, right) => left.path.localeCompare(right.path));
  const files = orderedPayloads.map((payload) =>
    StaticArtifactFileDigest.create({
      pathDigest: StaticArtifactDigest.rehydrate(digestText(payload.path)),
      contentDigest: StaticArtifactDigest.rehydrate(payload.contentDigest),
      sizeBytes: StaticArtifactByteSize.rehydrate(payload.sizeBytes),
      mimeType: StaticArtifactMimeType.rehydrate(payload.mimeType),
    })._unsafeUnwrap(),
  );
  const manifestDigest = digestText(
    orderedPayloads
      .map((payload) => `${payload.path}:${payload.contentDigest}:${payload.sizeBytes}`)
      .join("\n"),
  );
  const manifest = StaticArtifactManifest.create({
    artifactId: StaticArtifactId.rehydrate(artifactId),
    manifestDigest: StaticArtifactDigest.rehydrate(manifestDigest),
    fileCount: StaticArtifactFileCount.rehydrate(files.length),
    totalBytes: StaticArtifactByteSize.rehydrate(
      orderedPayloads.reduce((sum, payload) => sum + payload.sizeBytes, 0),
    ),
    files,
  });
  if (manifest.isErr()) return err(manifest.error);

  return ok({
    manifest: manifest.value,
    files: orderedPayloads,
  });
}

async function createStaticArtifactPayload(
  sourceRoot: string,
  absolutePath: string,
): Promise<StaticArtifactFilePayload> {
  const relativePath = normalizeStaticArtifactPayloadPath(
    relative(sourceRoot, absolutePath).split(sepPattern).join("/"),
  )._unsafeUnwrap();
  const bytes = await readFileBytes(absolutePath);

  return {
    path: relativePath,
    sizeBytes: bytes.byteLength,
    mimeType: inferStaticArtifactMimeType(relativePath),
    contentDigest: digestBytes(bytes),
    async readBytes() {
      return bytes;
    },
  };
}

async function createStaticArtifactPayloadsFromZip(
  archivePath: string,
): Promise<Result<readonly StaticArtifactFilePayload[]>> {
  const archiveBytes = await readFileBytes(archivePath);
  const entries = readZipCentralDirectory(archiveBytes);
  if (entries.isErr()) return err(entries.error);

  const seenPaths = new Set<string>();
  const payloads: StaticArtifactFilePayload[] = [];
  for (const entry of entries.value) {
    if (entry.path.endsWith("/")) continue;
    const normalizedPath = normalizeStaticArtifactPayloadPath(entry.path);
    if (normalizedPath.isErr()) return err(normalizedPath.error);
    if (seenPaths.has(normalizedPath.value)) {
      return err(
        domainError.validation("Static artifact archive contains duplicate file paths", {
          path: normalizedPath.value,
        }),
      );
    }
    seenPaths.add(normalizedPath.value);

    const bytes = readZipEntryBytes(archiveBytes, entry);
    if (bytes.isErr()) return err(bytes.error);
    payloads.push({
      path: normalizedPath.value,
      sizeBytes: bytes.value.byteLength,
      mimeType: inferStaticArtifactMimeType(normalizedPath.value),
      contentDigest: digestBytes(bytes.value),
      async readBytes() {
        return bytes.value;
      },
    });
  }

  if (payloads.length === 0) {
    return err(
      domainError.validation("Static artifact archive must contain at least one file", {
        sourcePath: archivePath,
      }),
    );
  }

  return ok(payloads);
}

interface ZipCentralDirectoryEntry {
  readonly path: string;
  readonly compressionMethod: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
}

function readZipCentralDirectory(bytes: Uint8Array): Result<readonly ZipCentralDirectoryEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOfCentralDirectoryOffset = findZipEndOfCentralDirectory(view);
  if (endOfCentralDirectoryOffset === undefined) {
    return err(domainError.validation("Static artifact archive must be a valid .zip file"));
  }

  const entryCount = view.getUint16(endOfCentralDirectoryOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(endOfCentralDirectoryOffset + 16, true);
  const entries: ZipCentralDirectoryEntry[] = [];
  let cursor = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) {
      return err(domainError.validation("Static artifact archive central directory is invalid"));
    }

    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const fileNameStart = cursor + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    entries.push({
      path: new TextDecoder().decode(bytes.slice(fileNameStart, fileNameEnd)),
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    cursor = fileNameEnd + extraLength + commentLength;
  }

  return ok(entries);
}

function findZipEndOfCentralDirectory(view: DataView): number | undefined {
  if (view.byteLength < 22) return undefined;
  const minimumOffset = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  return undefined;
}

function readZipEntryBytes(
  archiveBytes: Uint8Array,
  entry: ZipCentralDirectoryEntry,
): Result<Uint8Array> {
  const view = new DataView(archiveBytes.buffer, archiveBytes.byteOffset, archiveBytes.byteLength);
  if (view.getUint32(entry.localHeaderOffset, true) !== 0x04034b50) {
    return err(domainError.validation("Static artifact archive local header is invalid"));
  }

  const fileNameLength = view.getUint16(entry.localHeaderOffset + 26, true);
  const extraLength = view.getUint16(entry.localHeaderOffset + 28, true);
  const dataStart = entry.localHeaderOffset + 30 + fileNameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > archiveBytes.byteLength) {
    return err(domainError.validation("Static artifact archive entry is truncated"));
  }

  const compressed = archiveBytes.slice(dataStart, dataEnd);
  if (entry.compressionMethod === 0) return ok(compressed);
  if (entry.compressionMethod === 8) {
    const inflated = inflateRawSync(compressed);
    if (inflated.byteLength !== entry.uncompressedSize) {
      return err(domainError.validation("Static artifact archive entry size is invalid"));
    }
    return ok(inflated);
  }

  return err(
    domainError.validation("Static artifact archive entry compression is unsupported", {
      compressionMethod: entry.compressionMethod,
    }),
  );
}

async function writeStaticArtifactFiles(
  artifactRoot: string,
  files: StoreStaticArtifactManifestInput["files"],
): Promise<void> {
  const filesRoot = join(artifactRoot, "files");
  await mkdir(filesRoot, { recursive: true });

  for (const file of files ?? []) {
    const safePath = resolvePayloadPath(filesRoot, file.path);
    if (safePath.isErr()) {
      throw new Error(safePath.error.message);
    }
    await mkdir(dirname(safePath.value), { recursive: true });
    await writeFile(safePath.value, await file.readBytes());
  }
}

function resolvePayloadPath(rootPath: string, payloadPath: string): Result<string> {
  const normalized = normalizeStaticArtifactPayloadPath(payloadPath);
  if (normalized.isErr()) return err(normalized.error);

  return resolveChild(rootPath, normalized.value.split("/"));
}

function normalizeStaticArtifactPayloadPath(payloadPath: string): Result<string> {
  const segments = payloadPath.split(/[\\/]+/).filter((segment) => segment.length > 0);
  if (isAbsolute(payloadPath) || segments.length === 0 || segments.some(isUnsafePathSegment)) {
    return err(
      domainError.validation("Static artifact file payload path must be relative and safe", {
        path: payloadPath,
      }),
    );
  }

  return ok(segments.join("/"));
}

function isUnsafePathSegment(segment: string): boolean {
  return segment === "." || segment === ".." || segment.includes(":") || segment.includes("\0");
}

function resolveChild(rootPath: string, segments: readonly string[]): Result<string> {
  const root = resolve(rootPath);
  const child = resolve(root, ...segments);
  const childRelativePath = relative(root, child);
  if (childRelativePath.startsWith("..") || isAbsolute(childRelativePath)) {
    return err(
      domainError.validation("Static artifact filesystem path escapes storage root", {
        rootPath: root,
        relativePath: childRelativePath,
      }),
    );
  }

  return ok(child);
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

const sepPattern = /[\\/]+/g;

function inferStaticArtifactMimeType(path: string): string {
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith(".html") || lowerPath.endsWith(".htm")) return "text/html";
  if (lowerPath.endsWith(".css")) return "text/css";
  if (lowerPath.endsWith(".js") || lowerPath.endsWith(".mjs")) return "text/javascript";
  if (lowerPath.endsWith(".json")) return "application/json";
  if (lowerPath.endsWith(".svg")) return "image/svg+xml";
  if (lowerPath.endsWith(".png")) return "image/png";
  if (lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg")) return "image/jpeg";
  if (lowerPath.endsWith(".gif")) return "image/gif";
  if (lowerPath.endsWith(".webp")) return "image/webp";
  if (lowerPath.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

function digestBytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function digestText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
