import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import {
  createAdapterSpanName,
  type DeploymentConfigReader,
  type DeploymentConfigSnapshot,
  type DeploymentConfiguredTarget,
  type ExecutionContext,
  type SourceDetectionResult,
  type SourceDetector,
  yunduTraceAttributes,
} from "@yundu/application";
import {
  DisplayNameText,
  domainError,
  err,
  FilePathText,
  ok,
  type Result,
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
} from "@yundu/core";
import {
  domainsFromDeploymentConfig,
  healthCheckPathFromDeploymentConfig,
  parseYunduDeploymentConfig,
  providerKeyFromTargetConfig,
  targetKeyFromDeploymentConfig,
  targetsFromDeploymentConfig,
  type YunduDeploymentConfig,
  type YunduDeploymentTargetConfig,
  yunduDeploymentConfigFileNames,
} from "@yundu/deployment-config";

interface LocalProjectProfile {
  runtimeFamily: Extract<SourceRuntimeFamily, "java" | "node" | "python">;
  framework?: SourceFramework;
  packageManager?: SourcePackageManager;
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

class NodeProjectProfileDetector implements LocalProjectProfileDetector {
  detect(path: string): LocalProjectProfile | null {
    const packageJsonPath = join(path, "package.json");

    if (!existsSync(packageJsonPath)) {
      return null;
    }

    const packageJson = readJsonObject(packageJsonPath);
    const scripts =
      packageJson?.scripts && typeof packageJson.scripts === "object"
        ? (packageJson.scripts as Record<string, unknown>)
        : {};
    const packageManager =
      typeof packageJson?.packageManager === "string"
        ? packageJson.packageManager.startsWith("bun")
          ? "bun"
          : packageJson.packageManager.startsWith("pnpm")
            ? "pnpm"
            : "npm"
        : "npm";
    const dependencies =
      packageJson?.dependencies && typeof packageJson.dependencies === "object"
        ? (packageJson.dependencies as Record<string, unknown>)
        : {};
    const devDependencies =
      packageJson?.devDependencies && typeof packageJson.devDependencies === "object"
        ? (packageJson.devDependencies as Record<string, unknown>)
        : {};
    const hasNextDependency = "next" in dependencies || "next" in devDependencies;
    const hasNextConfig =
      existsSync(join(path, "next.config.js")) ||
      existsSync(join(path, "next.config.mjs")) ||
      existsSync(join(path, "next.config.ts"));
    const detectedScripts: SourceDetectedScript[] = [
      ...(typeof scripts.build === "string" ? ["build" as const] : []),
      ...(typeof scripts.start === "string" ? ["start" as const] : []),
      ...(typeof scripts["start:built"] === "string" ? ["start-built" as const] : []),
    ];
    const runtimeVersion = readFirstExistingVersion(path, [".node-version", ".nvmrc"]);

    return {
      runtimeFamily: "node",
      ...(hasNextDependency || hasNextConfig ? { framework: "nextjs" as const } : {}),
      packageManager,
      ...(runtimeVersion ? { runtimeVersion } : {}),
      ...(typeof packageJson?.name === "string" ? { projectName: packageJson.name } : {}),
      detectedFiles: ["package-json", ...(hasNextConfig ? ["next-config" as const] : [])],
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
    const projectName = pyproject?.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1];
    const runtimeVersion = readFirstExistingVersion(path, [".python-version"]);

    return {
      runtimeFamily: "python",
      ...(runtimeVersion ? { runtimeVersion } : {}),
      ...(projectName ? { projectName } : {}),
      detectedFiles: [
        ...(existsSync(pyprojectPath) ? ["pyproject-toml" as const] : []),
        ...(existsSync(requirementsPath) ? ["requirements-txt" as const] : []),
      ],
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
          [yunduTraceAttributes.sourceLocator]: locator,
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

function toConfiguredTarget(target: YunduDeploymentTargetConfig): DeploymentConfiguredTarget {
  return {
    providerKey: providerKeyFromTargetConfig(target),
    ...(target.key ? { key: target.key } : {}),
    ...(target.name ? { name: target.name } : {}),
    ...(target.host ? { host: target.host } : {}),
    ...(target.port ? { port: target.port } : {}),
    ...(target.destination
      ? {
          destination: {
            ...(target.destination.name ? { name: target.destination.name } : {}),
            ...(target.destination.kind ? { kind: target.destination.kind } : {}),
          },
        }
      : {}),
  };
}

function toDeploymentConfigSnapshot(
  config: YunduDeploymentConfig,
  configFilePath: string,
): DeploymentConfigSnapshot {
  const targets = targetsFromDeploymentConfig(config).map((target) => toConfiguredTarget(target));
  const healthCheckPath = healthCheckPathFromDeploymentConfig(config);
  const targetKey = targetKeyFromDeploymentConfig(config);
  const domains = domainsFromDeploymentConfig(config);

  return {
    configFilePath,
    ...(config.project
      ? {
          project: {
            name: config.project.name,
            ...(config.project.description ? { description: config.project.description } : {}),
          },
        }
      : {}),
    ...(config.environment
      ? {
          environment: {
            name: config.environment.name,
            ...(config.environment.kind ? { kind: config.environment.kind } : {}),
          },
        }
      : {}),
    ...(config.resource
      ? {
          resource: {
            name: config.resource.name,
            ...(config.resource.kind ? { kind: config.resource.kind } : {}),
            ...(config.resource.description ? { description: config.resource.description } : {}),
            ...(config.resource.services ? { services: config.resource.services } : {}),
          },
        }
      : {}),
    ...(targets.length > 0 ? { targets } : {}),
    ...(config.deployment
      ? {
          deployment: {
            ...(config.deployment.method ? { method: config.deployment.method } : {}),
            ...(config.deployment.installCommand
              ? { installCommand: config.deployment.installCommand }
              : {}),
            ...(config.deployment.buildCommand
              ? { buildCommand: config.deployment.buildCommand }
              : {}),
            ...(config.deployment.startCommand
              ? { startCommand: config.deployment.startCommand }
              : {}),
            ...(config.deployment.port ? { port: config.deployment.port } : {}),
            ...(healthCheckPath ? { healthCheckPath } : {}),
            ...(config.deployment.proxy ? { proxyKind: config.deployment.proxy } : {}),
            ...(domains ? { domains } : {}),
            ...(config.deployment.pathPrefix ? { pathPrefix: config.deployment.pathPrefix } : {}),
            ...(config.deployment.tlsMode ? { tlsMode: config.deployment.tlsMode } : {}),
            ...(targetKey ? { targetKey } : {}),
          },
        }
      : {}),
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

function findConfigFile(sourceLocator: string, configFilePath?: string): string | null {
  if (configFilePath) {
    const explicitPath = resolve(configFilePath);
    return existsSync(explicitPath) ? explicitPath : null;
  }

  const sourceDirectory = resolveLocalSourceDirectory(sourceLocator);
  if (!sourceDirectory) {
    return null;
  }

  for (const candidate of yunduDeploymentConfigFileNames) {
    const path = join(sourceDirectory, candidate);
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
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
          [yunduTraceAttributes.sourceLocator]: input.sourceLocator,
        },
      },
      async () => {
        const configFilePath = findConfigFile(input.sourceLocator, input.configFilePath);
        const inferred = inferConfigFromLocalSource(input.sourceLocator);

        if (input.configFilePath && !configFilePath) {
          return err(
            domainError.validation("Deployment config file was not found", {
              configFilePath: input.configFilePath,
            }),
          );
        }

        if (!configFilePath) {
          return ok(inferred);
        }

        const parsed = readJsonObject(configFilePath);
        const parsedConfig = parseYunduDeploymentConfig(parsed);

        if (!parsedConfig.success) {
          return err(
            domainError.validation("Yundu deployment config is invalid", {
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
        const project = config.project ?? inferred?.project;

        return ok({
          ...config,
          ...(project ? { project } : {}),
        });
      },
    );
  }
}
