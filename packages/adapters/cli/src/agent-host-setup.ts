import { existsSync } from "node:fs";
import { cp } from "node:fs/promises";
import { join } from "node:path";
import { type DomainError, err, ok, type Result } from "@appaloft/core";
import {
  type CliControlPlaneEnvironment,
  type CliControlPlaneProfileStore,
} from "./control-plane-profile.js";
import { resolveAppaloftSkillPath } from "./local-scratch-session.js";
import {
  installCodexMcpHost,
  installCursorMcpHost,
  installOpenCodeMcpHost,
  type McpHostInstallReport,
  resolveAgentsHome,
  resolveClaudeHome,
  resolveCodexHome,
  resolveCursorHome,
  resolveOpenCodeHome,
} from "./mcp-host-install.js";

export const AGENT_SETUP_SCHEMA_VERSION = "appaloft.setup.agent/v1";
export const AGENT_SETUP_DETECTION_LIST = ["cursor", "opencode", "codex", "claude"] as const;

export type AgentSetupHost = (typeof AGENT_SETUP_DETECTION_LIST)[number];

export interface AgentSetupSkillCopy {
  readonly host: AgentSetupHost | "agents";
  readonly path: string;
}

export interface AgentSetupMcpCopy {
  readonly host: AgentSetupHost;
  readonly configPath?: string;
  readonly command?: string;
  readonly args?: readonly string[];
  readonly skipped?: boolean;
  readonly reason?: string;
}

export interface AgentSetupReport {
  readonly schemaVersion: typeof AGENT_SETUP_SCHEMA_VERSION;
  readonly detectionList: readonly AgentSetupHost[];
  readonly detectedHosts: readonly (AgentSetupHost | "agents")[];
  readonly skills: readonly AgentSetupSkillCopy[];
  readonly mcp: readonly AgentSetupMcpCopy[];
  readonly profile?: McpHostInstallReport["profile"];
}

export interface AgentHostSetupInput {
  readonly store: CliControlPlaneProfileStore;
  readonly env?: CliControlPlaneEnvironment | undefined;
  readonly home: string;
  readonly requestedProfile?: string | undefined;
  readonly serverName?: string | undefined;
  readonly command?: string | undefined;
  readonly skillDir?: string | undefined;
  readonly cursorHome?: string | undefined;
  readonly opencodeHome?: string | undefined;
  readonly agentsHome?: string | undefined;
  readonly claudeHome?: string | undefined;
  readonly codexHome?: string | undefined;
  readonly which?: ((name: string) => string | null | undefined) | undefined;
  readonly exists?: ((path: string) => boolean) | undefined;
}

function hostDetected(input: {
  readonly forced: boolean;
  readonly directory: string;
  readonly binaries: readonly string[];
  readonly exists: (path: string) => boolean;
  readonly which: (name: string) => string | null | undefined;
}): boolean {
  if (input.forced) {
    return true;
  }
  if (input.exists(input.directory)) {
    return true;
  }
  return input.binaries.some((binary) => Boolean(input.which(binary)));
}

async function copySkillTree(source: string, dest: string): Promise<void> {
  await cp(source, dest, { recursive: true, force: true });
}

function skillNotFoundError(): DomainError {
  return {
    code: "appaloft_skill_not_found",
    category: "user",
    message:
      "Appaloft skill source was not found; pass --skill-dir or run from an Appaloft checkout that contains skills/appaloft",
    retryable: false,
    details: {
      phase: "agent-setup-skill-copy",
    },
  };
}

function noHostDetectedError(detectionList: readonly AgentSetupHost[]): DomainError {
  return {
    code: "agent_host_not_detected",
    category: "user",
    message:
      "No agent hosts detected. Detection list includes cursor and opencode (also codex and claude). Install Cursor or OpenCode, or pass --cursor-home / --opencode-home.",
    retryable: false,
    details: {
      phase: "agent-setup-detect",
      detectionList: [...detectionList],
    },
  };
}

export async function runAgentHostSetup(
  input: AgentHostSetupInput,
): Promise<Result<AgentSetupReport, DomainError>> {
  const exists = input.exists ?? existsSync;
  const which = input.which ?? ((name: string) => Bun.which(name));
  const env = input.env ?? {};

  const cursorHome = resolveCursorHome({
    explicit: input.cursorHome,
    env,
    home: input.home,
  });
  const opencodeHome = resolveOpenCodeHome({
    explicit: input.opencodeHome,
    env,
    home: input.home,
  });
  const agentsHome = resolveAgentsHome({
    explicit: input.agentsHome,
    env,
    home: input.home,
  });
  const claudeHome = resolveClaudeHome({
    explicit: input.claudeHome,
    env,
    home: input.home,
  });
  const codexHome = resolveCodexHome({
    explicit: input.codexHome,
    env,
    home: input.home,
  });

  const detected = new Set<AgentSetupHost>();
  if (
    hostDetected({
      forced: Boolean(input.cursorHome?.trim()),
      directory: cursorHome,
      binaries: ["cursor"],
      exists,
      which,
    })
  ) {
    detected.add("cursor");
  }
  if (
    hostDetected({
      forced: Boolean(input.opencodeHome?.trim()),
      directory: opencodeHome,
      binaries: ["opencode"],
      exists,
      which,
    })
  ) {
    detected.add("opencode");
  }
  if (
    hostDetected({
      forced: Boolean(input.codexHome?.trim()),
      directory: codexHome,
      binaries: ["codex"],
      exists,
      which,
    })
  ) {
    detected.add("codex");
  }
  if (
    hostDetected({
      forced: Boolean(input.claudeHome?.trim()),
      directory: claudeHome,
      binaries: ["claude"],
      exists,
      which,
    })
  ) {
    detected.add("claude");
  }

  if (detected.size === 0) {
    return err(noHostDetectedError(AGENT_SETUP_DETECTION_LIST));
  }

  const skillSource = input.skillDir?.trim() || resolveAppaloftSkillPath();
  if (!skillSource || !exists(join(skillSource, "SKILL.md"))) {
    return err(skillNotFoundError());
  }

  const skills: AgentSetupSkillCopy[] = [];
  const skillTargets: AgentSetupSkillCopy[] = [
    { host: "agents", path: join(agentsHome, "skills", "appaloft") },
  ];
  if (detected.has("cursor")) {
    skillTargets.push({ host: "cursor", path: join(cursorHome, "skills", "appaloft") });
  }
  if (detected.has("opencode")) {
    skillTargets.push({ host: "opencode", path: join(opencodeHome, "skills", "appaloft") });
  }
  if (detected.has("claude")) {
    skillTargets.push({ host: "claude", path: join(claudeHome, "skills", "appaloft") });
  }

  try {
    for (const target of skillTargets) {
      await copySkillTree(skillSource, target.path);
      if (!exists(join(target.path, "SKILL.md"))) {
        return err(skillNotFoundError());
      }
      skills.push(target);
    }
  } catch (error) {
    return err({
      code: "appaloft_skill_copy_failed",
      category: "infra",
      message: "Appaloft skill could not be copied into detected agent hosts",
      retryable: true,
      details: {
        phase: "agent-setup-skill-copy",
        message: error instanceof Error ? error.message : String(error),
      },
    } satisfies DomainError);
  }

  const mcp: AgentSetupMcpCopy[] = [];
  let profile: McpHostInstallReport["profile"] | undefined;
  const sharedInstall = {
    store: input.store,
    requestedProfile: input.requestedProfile,
    serverName: input.serverName,
    command: input.command,
  };

  if (detected.has("cursor")) {
    const installed = await installCursorMcpHost({
      ...sharedInstall,
      cursorHome,
    });
    if (installed.isErr()) {
      return err(installed.error);
    }
    profile = installed.value.profile;
    mcp.push({
      host: "cursor",
      configPath: installed.value.configPath,
      command: installed.value.command,
      args: installed.value.args,
    });
  }

  if (detected.has("opencode")) {
    const installed = await installOpenCodeMcpHost({
      ...sharedInstall,
      opencodeHome,
    });
    if (installed.isErr()) {
      return err(installed.error);
    }
    profile = installed.value.profile;
    mcp.push({
      host: "opencode",
      configPath: installed.value.configPath,
      command: installed.value.command,
      args: installed.value.args,
    });
  }

  if (detected.has("codex")) {
    const installed = await installCodexMcpHost({
      ...sharedInstall,
      requestedProfile: input.requestedProfile ?? "mcp",
      codexHome,
    });
    if (installed.isErr()) {
      mcp.push({
        host: "codex",
        skipped: true,
        reason:
          installed.error.code === "control_plane_profile_not_found" ||
          installed.error.code === "validation_error"
            ? "bearer-mcp-profile-required"
            : installed.error.code,
      });
    } else {
      profile = installed.value.profile;
      mcp.push({
        host: "codex",
        configPath: installed.value.configPath,
        command: installed.value.command,
        args: installed.value.args,
      });
    }
  }

  const detectedHosts: Array<AgentSetupHost | "agents"> = [
    "agents",
    ...AGENT_SETUP_DETECTION_LIST.filter((host) => detected.has(host)),
  ];

  return ok({
    schemaVersion: AGENT_SETUP_SCHEMA_VERSION,
    detectionList: AGENT_SETUP_DETECTION_LIST,
    detectedHosts,
    skills,
    mcp,
    ...(profile ? { profile } : {}),
  });
}
