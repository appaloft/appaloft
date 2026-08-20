import { existsSync } from "node:fs";
import { cp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type DomainError, err, ok, type Result } from "@appaloft/core";
import {
  type CliControlPlaneEnvironment,
  type CliControlPlaneProfileStore,
} from "./control-plane-profile.js";
import { resolveAppaloftSkillPath } from "./local-scratch-session.js";
import {
  installClaudeCodeMcpHost,
  installCursorMcpHost,
  installOpenCodeMcpHost,
  type McpHostInstallReport,
  resolveAgentsHome,
  resolveClaudeHome,
  resolveCursorHome,
  resolveOpenCodeHome,
} from "./mcp-host-install.js";

export const AGENT_SETUP_SCHEMA_VERSION = "appaloft.setup.agent/v1";
export const AGENT_SETUP_AGENT_LIST = ["universal", "claude-code", "cursor", "opencode"] as const;

export type AgentSetupHost = (typeof AGENT_SETUP_AGENT_LIST)[number];

export interface AgentSetupSkillCopy {
  readonly host: AgentSetupHost;
  readonly path: string;
  readonly skipped?: boolean | undefined;
}

export interface AgentSetupMcpCopy {
  readonly host: AgentSetupHost;
  readonly configPath?: string | undefined;
  readonly command?: string | undefined;
  readonly args?: readonly string[] | undefined;
  readonly skipped?: boolean | undefined;
  readonly reason?: string | undefined;
}

export interface AgentSetupReport {
  readonly schemaVersion: typeof AGENT_SETUP_SCHEMA_VERSION;
  readonly agentList: readonly AgentSetupHost[];
  readonly detectionList: readonly AgentSetupHost[];
  readonly selectedAgents: readonly AgentSetupHost[];
  readonly skills: readonly AgentSetupSkillCopy[];
  readonly mcp: readonly AgentSetupMcpCopy[];
  readonly profile?: McpHostInstallReport["profile"] | undefined;
}

export interface AgentHostSetupInput {
  readonly store: CliControlPlaneProfileStore;
  readonly env?: CliControlPlaneEnvironment | undefined;
  readonly home: string;
  readonly requestedProfile?: string | undefined;
  readonly serverName?: string | undefined;
  readonly command?: string | undefined;
  readonly skillDir?: string | undefined;
  readonly agents?: readonly string[] | undefined;
  readonly cursorHome?: string | undefined;
  readonly opencodeHome?: string | undefined;
  readonly agentsHome?: string | undefined;
  readonly claudeHome?: string | undefined;
  readonly exists?: ((path: string) => boolean) | undefined;
}

function unsupportedAgentError(value: string): DomainError {
  return {
    code: "validation_error",
    category: "user",
    message: `Unsupported agent ${value}. Agent list includes universal, claude-code, cursor, and opencode.`,
    retryable: false,
    details: {
      phase: "agent-setup-agent",
      agentList: [...AGENT_SETUP_AGENT_LIST],
    },
  };
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

function parseSelectedAgents(values: readonly string[] | undefined): Result<AgentSetupHost[]> {
  if (!values || values.length === 0) {
    return ok([]);
  }
  const selected: AgentSetupHost[] = [];
  for (const value of values) {
    const agent = AGENT_SETUP_AGENT_LIST.find((candidate) => candidate === value);
    if (!agent) {
      return err(unsupportedAgentError(value));
    }
    if (!selected.includes(agent)) {
      selected.push(agent);
    }
  }
  return ok(selected);
}

function defaultSelectedAgents(input: {
  readonly claudeHome: string;
  readonly cursorHome: string;
  readonly exists: (path: string) => boolean;
}): AgentSetupHost[] {
  const selected: AgentSetupHost[] = ["universal"];
  if (input.exists(input.claudeHome)) {
    selected.push("claude-code");
  }
  if (input.exists(input.cursorHome)) {
    selected.push("cursor");
  }
  return selected;
}

async function copySkillTreeIfNeeded(input: {
  readonly source: string;
  readonly dest: string;
  readonly exists: (path: string) => boolean;
}): Promise<Result<"copied" | "skipped", DomainError>> {
  const sourceSkill = join(input.source, "SKILL.md");
  const destSkill = join(input.dest, "SKILL.md");
  if (input.exists(destSkill)) {
    try {
      const [sourceText, destText] = await Promise.all([
        readFile(sourceSkill, "utf8"),
        readFile(destSkill, "utf8"),
      ]);
      if (sourceText === destText) {
        return ok("skipped");
      }
    } catch (error) {
      return err({
        code: "appaloft_skill_copy_failed",
        category: "infra",
        message: "Appaloft skill could not be compared for an already-installed copy",
        retryable: true,
        details: {
          phase: "agent-setup-skill-copy",
          message: error instanceof Error ? error.message : String(error),
        },
      } satisfies DomainError);
    }
  }
  try {
    await cp(input.source, input.dest, { recursive: true, force: true });
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
  if (!input.exists(destSkill)) {
    return err(skillNotFoundError());
  }
  return ok("copied");
}

export async function runAgentHostSetup(
  input: AgentHostSetupInput,
): Promise<Result<AgentSetupReport, DomainError>> {
  const exists = input.exists ?? existsSync;
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

  const requestedAgents = parseSelectedAgents(input.agents);
  if (requestedAgents.isErr()) {
    return err(requestedAgents.error);
  }
  const selectedAgents =
    requestedAgents.value.length > 0
      ? requestedAgents.value
      : defaultSelectedAgents({
          claudeHome,
          cursorHome,
          exists,
        });

  const skillSource = input.skillDir?.trim() || resolveAppaloftSkillPath();
  if (!skillSource || !exists(join(skillSource, "SKILL.md"))) {
    return err(skillNotFoundError());
  }

  const skillTargets: AgentSetupSkillCopy[] = [];
  for (const host of selectedAgents) {
    if (host === "universal") {
      skillTargets.push({ host, path: join(agentsHome, "skills", "appaloft") });
    }
    if (host === "claude-code") {
      skillTargets.push({ host, path: join(claudeHome, "skills", "appaloft") });
    }
    if (host === "cursor") {
      skillTargets.push({ host, path: join(cursorHome, "skills", "appaloft") });
    }
    if (host === "opencode") {
      skillTargets.push({ host, path: join(opencodeHome, "skills", "appaloft") });
    }
  }

  const skills: AgentSetupSkillCopy[] = [];
  for (const target of skillTargets) {
    const copied = await copySkillTreeIfNeeded({
      source: skillSource,
      dest: target.path,
      exists,
    });
    if (copied.isErr()) {
      return err(copied.error);
    }
    skills.push({
      ...target,
      ...(copied.value === "skipped" ? { skipped: true } : {}),
    });
  }

  const mcp: AgentSetupMcpCopy[] = [];
  let profile: McpHostInstallReport["profile"] | undefined;
  const sharedInstall = {
    store: input.store,
    requestedProfile: input.requestedProfile,
    serverName: input.serverName,
    command: input.command,
  };

  const pushInstalled = (
    host: AgentSetupHost,
    installed: Result<McpHostInstallReport, DomainError>,
  ): Result<void, DomainError> => {
    if (installed.isErr()) {
      return err(installed.error);
    }
    profile = installed.value.profile;
    mcp.push({
      host,
      configPath: installed.value.configPath,
      command: installed.value.command,
      args: installed.value.args,
      ...(installed.value.skipped ? { skipped: true } : {}),
    });
    return ok(undefined);
  };

  if (selectedAgents.includes("cursor")) {
    const installed = await installCursorMcpHost({
      ...sharedInstall,
      cursorHome,
    });
    const pushed = pushInstalled("cursor", installed);
    if (pushed.isErr()) {
      return err(pushed.error);
    }
  }

  if (selectedAgents.includes("claude-code")) {
    const installed = await installClaudeCodeMcpHost({
      ...sharedInstall,
      home: input.home,
    });
    const pushed = pushInstalled("claude-code", installed);
    if (pushed.isErr()) {
      return err(pushed.error);
    }
  }

  if (selectedAgents.includes("opencode")) {
    const installed = await installOpenCodeMcpHost({
      ...sharedInstall,
      opencodeHome,
    });
    const pushed = pushInstalled("opencode", installed);
    if (pushed.isErr()) {
      return err(pushed.error);
    }
  }

  return ok({
    schemaVersion: AGENT_SETUP_SCHEMA_VERSION,
    agentList: AGENT_SETUP_AGENT_LIST,
    detectionList: AGENT_SETUP_AGENT_LIST,
    selectedAgents,
    skills,
    mcp,
    ...(profile ? { profile } : {}),
  });
}
