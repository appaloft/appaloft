import { spawn } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";

import { domainError } from "@appaloft/core";

export const SCRATCH_BANNER = "Local scratch · this Mac · not saved remotely";
export const OPENCODE_INSTALL_URL = "https://opencode.ai";
export const PI_INSTALL_URL = "https://www.npmjs.com/package/@mariozechner/pi-coding-agent";

export type ScratchHarnessName = "opencode" | "pi" | "omp";

export interface ScratchHarnessResolution {
  readonly name: ScratchHarnessName;
  readonly argv: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly skillOffered: boolean;
  readonly skillPath?: string;
}

export interface ScratchSession {
  readonly path: string;
  readonly banner: typeof SCRATCH_BANNER;
  readonly harness: ScratchHarnessResolution;
}

export type ScratchHarnessResolver = (path: string) => Promise<ScratchHarnessResolution>;

export type ScratchAgentLauncher = (input: {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string>>;
}) => Promise<void>;

export interface ScratchHarnessProbe {
  readonly which?: (name: string) => string | null | undefined;
  readonly isInteractive?: boolean;
  readonly confirmInstall?: () => Promise<boolean>;
  readonly write?: (message: string) => void;
  readonly resolveSkillPath?: () => string | undefined;
  readonly resolveAppaloftCli?: () => readonly string[] | undefined;
}

export function resolveScratchPath(path = "."): string {
  const selectedPath = path.trim();
  if (!selectedPath || selectedPath.includes("\0") || /[\r\n]/u.test(selectedPath)) {
    throw domainError.validation("Scratch path is invalid", {
      code: "workspace_scratch_path_invalid",
      phase: "scratch-path",
    });
  }
  const resolved = resolve(selectedPath);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw domainError.validation("Scratch path does not exist", {
      code: "workspace_scratch_path_invalid",
      phase: "scratch-path",
    });
  }
  return resolved;
}

export function resolveAppaloftSkillPath(startDirs: readonly string[] = []): string | undefined {
  const starts = [...startDirs, import.meta.dir].filter((value): value is string => Boolean(value));

  for (const start of starts) {
    let current = resolve(start);
    for (let depth = 0; depth < 10; depth += 1) {
      const skillFile = join(current, "skills", "appaloft", "SKILL.md");
      if (existsSync(skillFile)) {
        return join(current, "skills", "appaloft");
      }
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return undefined;
}

export function resolveAppaloftMcpArgv(
  env: NodeJS.ProcessEnv = process.env,
): readonly ["mcp", "stdio"] | readonly ["mcp", "remote-stdio"] {
  const mode = env.APPALOFT_CONTROL_PLANE_MODE?.trim();
  const url = env.APPALOFT_CONTROL_PLANE_URL?.trim();
  const remote = Boolean(url) || (Boolean(mode) && mode !== "none" && mode !== "auto");
  return remote ? (["mcp", "remote-stdio"] as const) : (["mcp", "stdio"] as const);
}

export function resolveLocalAppaloftCli(
  which: (name: string) => string | null | undefined = (name) => Bun.which(name),
  env: NodeJS.ProcessEnv = process.env,
): readonly string[] | undefined {
  const mcpArgv = resolveAppaloftMcpArgv(env);
  const sourceEntry = process.argv[1];
  if (sourceEntry) {
    try {
      const absoluteEntry = realpathSync(resolve(sourceEntry));
      if (/(?:^|\/)(?:appaloft(?:dev)?|index\.ts)$/u.test(absoluteEntry.replaceAll("\\", "/"))) {
        return [process.execPath, absoluteEntry, ...mcpArgv];
      }
    } catch {
      // Fall through to PATH binaries when argv[1] is not a real file.
    }
  }
  const wrapper = which("appaloftdev");
  if (wrapper) return [realpathSync(resolve(wrapper)), ...mcpArgv];
  const installed = which("appaloft");
  if (installed) return [realpathSync(resolve(installed)), ...mcpArgv];
  return undefined;
}

export function buildScratchHarness(
  name: ScratchHarnessName,
  executable: string,
  options: {
    readonly skillPath?: string;
    readonly appaloftCli?: readonly string[];
  } = {},
): ScratchHarnessResolution {
  const skillPath = options.skillPath;
  const skillOffered = Boolean(skillPath && existsSync(join(skillPath, "SKILL.md")));
  if (name === "pi" || name === "omp") {
    return {
      name,
      argv: skillOffered && skillPath ? [executable, "--skill", skillPath] : [executable],
      ...(skillOffered && skillPath ? { skillPath } : {}),
      skillOffered,
    };
  }

  const config: Record<string, unknown> = {};
  if (skillOffered && skillPath) {
    config.skills = { paths: [dirname(skillPath)] };
  }
  if (options.appaloftCli && options.appaloftCli.length > 0) {
    config.mcp = {
      appaloft: {
        type: "local",
        command: ["env", "APPALOFT_CONTROL_PLANE_MODE=none", ...options.appaloftCli],
        enabled: true,
      },
    };
  }

  return {
    name,
    argv: [executable],
    ...(Object.keys(config).length > 0
      ? { env: { OPENCODE_CONFIG_CONTENT: JSON.stringify(config) } }
      : {}),
    ...(skillOffered && skillPath ? { skillPath } : {}),
    skillOffered,
  };
}

export function resolveNativeOpenCodeAttachEnv(
  probe: Pick<ScratchHarnessProbe, "resolveSkillPath" | "resolveAppaloftCli" | "which"> = {},
): Readonly<Record<string, string>> | undefined {
  const which = probe.which ?? ((name: string) => Bun.which(name));
  const skillPath = probe.resolveSkillPath ? probe.resolveSkillPath() : resolveAppaloftSkillPath();
  const appaloftCli = probe.resolveAppaloftCli
    ? probe.resolveAppaloftCli()
    : resolveLocalAppaloftCli(which);
  return buildScratchHarness("opencode", "opencode", {
    ...(skillPath ? { skillPath } : {}),
    ...(appaloftCli ? { appaloftCli } : {}),
  }).env;
}

async function confirmScratchInstall(): Promise<boolean> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await readline.question(
      "No OpenCode, Pi, or Oh My Pi binary found. Show install guidance? [y/N] ",
    );
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    readline.close();
  }
}

export async function resolveDefaultScratchHarness(
  _path = ".",
  probe: ScratchHarnessProbe = {},
): Promise<ScratchHarnessResolution> {
  const which = probe.which ?? ((name: string) => Bun.which(name));
  const names: ScratchHarnessName[] = ["opencode", "pi", "omp"];
  for (const name of names) {
    const executable = which(name);
    if (executable) {
      const skillPath = probe.resolveSkillPath
        ? probe.resolveSkillPath()
        : resolveAppaloftSkillPath();
      const appaloftCli = probe.resolveAppaloftCli
        ? probe.resolveAppaloftCli()
        : resolveLocalAppaloftCli(which);
      return buildScratchHarness(name, executable, {
        ...(skillPath ? { skillPath } : {}),
        ...(appaloftCli ? { appaloftCli } : {}),
      });
    }
  }

  const interactive = probe.isInteractive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const write = probe.write ?? ((message: string) => process.stdout.write(message));
  const guidance = `Install OpenCode from ${OPENCODE_INSTALL_URL}, Pi from ${PI_INSTALL_URL}, or Oh My Pi (\`omp\`), then retry.`;

  if (!interactive) {
    throw domainError.validation("Install OpenCode, Pi, or Oh My Pi, then retry appaloft code", {
      code: "workspace_scratch_agent_missing",
      phase: "scratch-harness",
      guidance,
    });
  }

  const accepted = await (probe.confirmInstall ?? confirmScratchInstall)();
  if (accepted) {
    write(`${guidance}\n`);
    throw domainError.validation("Install OpenCode, Pi, or Oh My Pi, then retry appaloft code", {
      code: "workspace_scratch_agent_missing",
      phase: "scratch-harness",
      guidance,
    });
  }

  throw domainError.validation("Install OpenCode, Pi, or Oh My Pi, then retry appaloft code", {
    code: "workspace_scratch_install_refused",
    phase: "scratch-harness",
    guidance,
  });
}

export async function resolveScratchSession(
  path = ".",
  resolveHarness: ScratchHarnessResolver = resolveDefaultScratchHarness,
): Promise<ScratchSession> {
  const resolvedPath = resolveScratchPath(path);
  const harness = await resolveHarness(resolvedPath);
  return {
    path: resolvedPath,
    banner: SCRATCH_BANNER,
    harness,
  };
}

export function launchScratchAgent(input: {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string>>;
}): Promise<void> {
  if (
    input.argv.length === 0 ||
    input.argv.length > 64 ||
    input.argv.some(
      (argument) =>
        !argument || argument.length > 2_048 || argument.includes("\0") || /[\r\n]/u.test(argument),
    )
  ) {
    return Promise.reject(
      domainError.validation("Scratch Agent command is invalid", {
        code: "workspace_scratch_agent_invalid",
        phase: "scratch-harness",
      }),
    );
  }
  const { promise, resolve: resolveLaunch, reject } = Promise.withResolvers<void>();
  const child = spawn(input.argv[0] as string, input.argv.slice(1), {
    cwd: input.cwd,
    env: input.env ? { ...process.env, ...input.env } : process.env,
    stdio: "inherit",
    shell: false,
  });
  child.once("error", (error) => reject(error));
  child.once("exit", (code, signal) => {
    if (code === 0) {
      resolveLaunch();
      return;
    }
    reject(
      domainError.conflict("Local Agent exited before the scratch session completed", {
        code: "workspace_scratch_agent_failed",
        phase: "scratch-harness",
        exitCode: code ?? -1,
        signal: signal ?? "unknown",
      }),
    );
  });
  return promise;
}
