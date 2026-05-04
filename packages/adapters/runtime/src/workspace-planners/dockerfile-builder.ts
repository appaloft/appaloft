import { type RuntimeExecutionPlan, type SourceInspectionSnapshot } from "@appaloft/core";
import {
  type GeneratedDockerBuildAsset,
  type GeneratedDockerBuildResult,
} from "../generated-docker-build-assets";
import { pinnedBunAlpineImage } from "./bun";
import {
  defaultStaticServerImage,
  renderStaticAccessFailureRendererAsset,
  renderStaticServerConfig,
  staticAccessFailureRendererAssetPath,
  staticAccessFailureRendererRootPath,
  staticServerConfigAssetPath,
  staticServerConfigPath,
  staticServerRoot,
} from "./static-server-config";

export interface DockerfileBuildContext {
  baseImage: string;
  env?: Record<string, string>;
  beforeCopyRunCommands?: readonly string[];
  installCommand?: string;
  buildCommand?: string;
  port?: number;
  startCommand: string;
}

export interface StaticSiteDockerfileContext {
  publishDirectory: string;
  installCommand?: string;
  buildCommand?: string;
  buildImage?: string;
  serverImage?: string;
}

const envKeyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const defaultStaticBuildImage = "node:22-alpine";

function dockerfileToken(value: string, label: string): string {
  const token = value.trim();
  if (!token || /[\r\n]/u.test(token)) {
    throw new Error(`Invalid Dockerfile ${label}`);
  }

  return token;
}

function jsonArray(values: readonly string[]): string {
  return JSON.stringify(values);
}

function generatedDockerBuildResult(
  dockerfile: string,
  contextAssets: readonly GeneratedDockerBuildAsset[] = [],
): GeneratedDockerBuildResult {
  return {
    dockerfile,
    contextAssets,
  };
}

export class DockerfileBuilder {
  private readonly instructions: string[] = [];

  from(image: string): this {
    return this.add(`FROM ${dockerfileToken(image, "base image")}`);
  }

  fromAs(image: string, alias: string): this {
    return this.add(
      `FROM ${dockerfileToken(image, "base image")} AS ${dockerfileToken(alias, "stage alias")}`,
    );
  }

  workdir(path: string): this {
    return this.add(`WORKDIR ${dockerfileToken(path, "workdir")}`);
  }

  env(key: string, value: string): this {
    if (!envKeyPattern.test(key)) {
      throw new Error(`Invalid Dockerfile env key: ${key}`);
    }

    return this.add(`ENV ${key}=${JSON.stringify(value)}`);
  }

  envAll(env?: Record<string, string>): this {
    for (const [key, value] of Object.entries(env ?? {})) {
      this.env(key, value);
    }

    return this;
  }

  runShell(command?: string): this {
    if (!command) {
      return this;
    }

    return this.exec("RUN", ["sh", "-lc", command]);
  }

  runShellAll(commands?: readonly string[]): this {
    for (const command of commands ?? []) {
      this.runShell(command);
    }

    return this;
  }

  copy(source: string, destination: string): this {
    return this.add(
      `COPY ${dockerfileToken(source, "copy source")} ${dockerfileToken(
        destination,
        "copy destination",
      )}`,
    );
  }

  copyJson(source: string, destination: string, options?: { from?: string }): this {
    const flag = options?.from ? ` --from=${dockerfileToken(options.from, "copy stage")}` : "";
    return this.add(
      `COPY${flag} ${jsonArray([
        dockerfileToken(source, "copy source"),
        dockerfileToken(destination, "copy destination"),
      ])}`,
    );
  }

  expose(port?: number): this {
    if (!port) {
      return this;
    }

    return this.add(`EXPOSE ${port}`);
  }

  cmdExec(command: readonly string[]): this {
    return this.exec("CMD", command);
  }

  cmdShell(command: string): this {
    return this.exec("CMD", ["sh", "-lc", command]);
  }

  build(): string {
    return `${this.instructions.join("\n")}\n`;
  }

  private exec(instruction: "CMD" | "RUN", command: readonly string[]): this {
    return this.add(`${instruction} ${jsonArray(command)}`);
  }

  private add(instruction: string): this {
    this.instructions.push(instruction);
    return this;
  }
}

export function renderWorkspaceDockerfile(context: DockerfileBuildContext): string {
  return renderWorkspaceDockerBuild(context).dockerfile;
}

export function renderWorkspaceDockerBuild(
  context: DockerfileBuildContext,
): GeneratedDockerBuildResult {
  return generatedDockerBuildResult(
    new DockerfileBuilder()
      .from(context.baseImage)
      .workdir("/app")
      .envAll(context.env)
      .runShellAll(context.beforeCopyRunCommands)
      .copy(".", ".")
      .runShell(context.installCommand)
      .runShell(context.buildCommand)
      .expose(context.port)
      .cmdShell(context.startCommand)
      .build(),
  );
}

export function dockerBuildFromExecution(input: {
  baseImage: string;
  execution: RuntimeExecutionPlan;
  env?: Record<string, string>;
  beforeCopyRunCommands?: readonly string[];
}): GeneratedDockerBuildResult | null {
  const startCommand = input.execution.startCommand;
  if (!startCommand) {
    return null;
  }

  return renderWorkspaceDockerBuild({
    baseImage: input.baseImage,
    ...(input.env ? { env: input.env } : {}),
    ...(input.beforeCopyRunCommands ? { beforeCopyRunCommands: input.beforeCopyRunCommands } : {}),
    ...(input.execution.installCommand ? { installCommand: input.execution.installCommand } : {}),
    ...(input.execution.buildCommand ? { buildCommand: input.execution.buildCommand } : {}),
    ...(input.execution.port ? { port: input.execution.port } : {}),
    startCommand,
  });
}

export function dockerfileFromExecution(input: {
  baseImage: string;
  execution: RuntimeExecutionPlan;
  env?: Record<string, string>;
  beforeCopyRunCommands?: readonly string[];
}): string | null {
  return dockerBuildFromExecution(input)?.dockerfile ?? null;
}

function normalizeStaticPublishDirectory(value: string): string | null {
  const trimmed = value.trim();
  if (
    !trimmed ||
    /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ||
    /^[a-z]:[\\/]/i.test(trimmed) ||
    /[\\\r\n;&|`$<>]/u.test(trimmed)
  ) {
    return null;
  }

  const segments = trimmed.replace(/^\/+/, "").replace(/\/+$/, "").split("/").filter(Boolean);

  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    return null;
  }

  return segments.join("/");
}

function staticBuildImage(input: {
  execution: RuntimeExecutionPlan;
  sourceInspection?: SourceInspectionSnapshot;
}): string {
  const commands = [input.execution.installCommand, input.execution.buildCommand]
    .filter((command): command is string => Boolean(command))
    .join("\n")
    .toLowerCase();

  if (input.sourceInspection?.packageManager === "bun" || /\bbun\b/u.test(commands)) {
    return pinnedBunAlpineImage;
  }

  const runtimeVersion = input.sourceInspection?.runtimeVersion ?? "22";
  return `node:${runtimeVersion}-alpine`;
}

function shouldEnableCorepack(buildImage: string): boolean {
  return buildImage.startsWith("node:");
}

export function renderStaticSiteDockerfile(context: StaticSiteDockerfileContext): string | null {
  return renderStaticSiteDockerBuild(context)?.dockerfile ?? null;
}

export function renderStaticSiteDockerBuild(
  context: StaticSiteDockerfileContext,
): GeneratedDockerBuildResult | null {
  const publishDirectory = normalizeStaticPublishDirectory(context.publishDirectory);
  if (!publishDirectory) {
    return null;
  }

  const serverImage = context.serverImage ?? defaultStaticServerImage;
  const publishDirectorySource = `${publishDirectory}/`;
  const contextAssets = [
    {
      relativePath: staticServerConfigAssetPath,
      contents: renderStaticServerConfig(),
    },
    {
      relativePath: staticAccessFailureRendererAssetPath,
      contents: renderStaticAccessFailureRendererAsset(),
    },
  ] as const;

  if (!context.installCommand && !context.buildCommand) {
    return generatedDockerBuildResult(
      new DockerfileBuilder()
        .from(serverImage)
        .copyJson(publishDirectorySource, staticServerRoot)
        .copyJson(staticServerConfigAssetPath, staticServerConfigPath)
        .copyJson(staticAccessFailureRendererAssetPath, staticAccessFailureRendererRootPath)
        .expose(80)
        .cmdExec(["nginx", "-g", "daemon off;"])
        .build(),
      contextAssets,
    );
  }

  const buildImage = context.buildImage ?? defaultStaticBuildImage;
  return generatedDockerBuildResult(
    new DockerfileBuilder()
      .fromAs(buildImage, "build")
      .workdir("/app")
      .runShell(shouldEnableCorepack(buildImage) ? "corepack enable || true" : undefined)
      .copy(".", ".")
      .runShell(context.installCommand)
      .runShell(context.buildCommand)
      .from(serverImage)
      .copyJson(`/app/${publishDirectorySource}`, staticServerRoot, { from: "build" })
      .copyJson(staticServerConfigAssetPath, staticServerConfigPath)
      .copyJson(staticAccessFailureRendererAssetPath, staticAccessFailureRendererRootPath)
      .expose(80)
      .cmdExec(["nginx", "-g", "daemon off;"])
      .build(),
    contextAssets,
  );
}

export function staticSiteDockerBuildFromExecution(input: {
  execution: RuntimeExecutionPlan;
  sourceInspection?: SourceInspectionSnapshot;
}): GeneratedDockerBuildResult | null {
  const publishDirectory = input.execution.metadata?.["static.publishDirectory"];
  if (!publishDirectory) {
    return null;
  }

  return renderStaticSiteDockerBuild({
    publishDirectory,
    ...(input.execution.installCommand ? { installCommand: input.execution.installCommand } : {}),
    ...(input.execution.buildCommand ? { buildCommand: input.execution.buildCommand } : {}),
    buildImage: staticBuildImage(input),
  });
}

export function staticSiteDockerfileFromExecution(input: {
  execution: RuntimeExecutionPlan;
  sourceInspection?: SourceInspectionSnapshot;
}): string | null {
  return staticSiteDockerBuildFromExecution(input)?.dockerfile ?? null;
}
