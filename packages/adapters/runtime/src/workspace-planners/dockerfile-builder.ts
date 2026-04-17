import { type RuntimeExecutionPlan } from "@appaloft/core";

export interface DockerfileBuildContext {
  baseImage: string;
  env?: Record<string, string>;
  beforeCopyRunCommands?: readonly string[];
  installCommand?: string;
  buildCommand?: string;
  port?: number;
  startCommand: string;
}

const envKeyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/u;

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

export class DockerfileBuilder {
  private readonly instructions: string[] = [];

  from(image: string): this {
    return this.add(`FROM ${dockerfileToken(image, "base image")}`);
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

  expose(port?: number): this {
    if (!port) {
      return this;
    }

    return this.add(`EXPOSE ${port}`);
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
  return new DockerfileBuilder()
    .from(context.baseImage)
    .workdir("/app")
    .envAll(context.env)
    .runShellAll(context.beforeCopyRunCommands)
    .copy(".", ".")
    .runShell(context.installCommand)
    .runShell(context.buildCommand)
    .expose(context.port)
    .cmdShell(context.startCommand)
    .build();
}

export function dockerfileFromExecution(input: {
  baseImage: string;
  execution: RuntimeExecutionPlan;
  env?: Record<string, string>;
  beforeCopyRunCommands?: readonly string[];
}): string | null {
  const startCommand = input.execution.startCommand;
  if (!startCommand) {
    return null;
  }

  return renderWorkspaceDockerfile({
    baseImage: input.baseImage,
    ...(input.env ? { env: input.env } : {}),
    ...(input.beforeCopyRunCommands
      ? { beforeCopyRunCommands: input.beforeCopyRunCommands }
      : {}),
    ...(input.execution.installCommand ? { installCommand: input.execution.installCommand } : {}),
    ...(input.execution.buildCommand ? { buildCommand: input.execution.buildCommand } : {}),
    ...(input.execution.port ? { port: input.execution.port } : {}),
    startCommand,
  });
}
