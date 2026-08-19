import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type DomainError, err, ok, type Result } from "@appaloft/core";
import {
  type CliControlPlaneEnvironment,
  type CliControlPlaneProfile,
  type CliControlPlaneProfileStore,
} from "./control-plane-profile.js";

export const CURSOR_MCP_INSTALL_SCHEMA_VERSION = "appaloft.cursor.mcp-install/v1";
export const CLAUDE_CODE_MCP_INSTALL_SCHEMA_VERSION = "appaloft.claude-code.mcp-install/v1";
export const OPENCODE_MCP_INSTALL_SCHEMA_VERSION = "appaloft.opencode.mcp-install/v1";
export const CODEX_MCP_INSTALL_SCHEMA_VERSION = "appaloft.codex.mcp-install/v1";

export interface McpHostInstallReport {
  readonly schemaVersion: string;
  readonly serverName: string;
  readonly configPath: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly skipped?: boolean | undefined;
  readonly profile: {
    readonly name: string;
    readonly baseUrl: string;
    readonly auth: {
      readonly kind: CliControlPlaneProfile["auth"]["kind"];
      readonly redacted: "***";
    };
  };
}

export interface McpHostInstallOptions {
  readonly store: CliControlPlaneProfileStore;
  readonly requestedProfile?: string | undefined;
  readonly serverName?: string | undefined;
  readonly command?: string | undefined;
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function tomlStringArray(values: readonly string[]): string {
  return `[${values.map((value) => tomlString(value)).join(", ")}]`;
}

function escapeTomlTableSegment(value: string): string {
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : tomlString(value);
}

function upsertCodexMcpServerConfig(input: {
  readonly existing: string;
  readonly serverName: string;
  readonly command: string;
  readonly args: readonly string[];
}): string {
  const tablePrefix = `[mcp_servers.${escapeTomlTableSegment(input.serverName)}`;
  const lines = input.existing.split(/\r?\n/);
  const kept: string[] = [];
  let skipping = false;

  for (const line of lines) {
    if (/^\s*\[/.test(line)) {
      skipping = line.startsWith(tablePrefix);
    }
    if (!skipping) {
      kept.push(line);
    }
  }

  while (kept.length > 0 && kept.at(-1)?.trim() === "") {
    kept.pop();
  }

  kept.push(
    "",
    `[mcp_servers.${escapeTomlTableSegment(input.serverName)}]`,
    `command = ${tomlString(input.command)}`,
    `args = ${tomlStringArray(input.args)}`,
    "startup_timeout_sec = 30",
    "tool_timeout_sec = 120",
    "",
  );

  return `${kept.join("\n")}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function mcpRemoteStdioArgs(profileName: string): readonly string[] {
  return ["mcp", "remote-stdio", "--profile", profileName];
}

export function redactedMcpInstallProfile(profile: CliControlPlaneProfile): {
  readonly name: string;
  readonly baseUrl: string;
  readonly auth: {
    readonly kind: CliControlPlaneProfile["auth"]["kind"];
    readonly redacted: "***";
  };
} {
  return {
    name: profile.name,
    baseUrl: profile.baseUrl,
    auth: {
      kind: profile.auth.kind,
      redacted: "***",
    },
  };
}

function parseJsonObjectFile(input: {
  readonly existing: string;
  readonly configPath: string;
  readonly phase: string;
  readonly code: string;
  readonly message: string;
}): Result<Record<string, unknown>> {
  const trimmed = input.existing.trim();
  if (!trimmed) {
    return ok({});
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isPlainObject(parsed)) {
      return err({
        code: input.code,
        category: "user",
        message: input.message,
        retryable: false,
        details: {
          phase: input.phase,
          configPath: input.configPath,
          reason: "json-root-not-object",
        },
      } satisfies DomainError);
    }
    return ok(parsed);
  } catch (error) {
    return err({
      code: input.code,
      category: "user",
      message: input.message,
      retryable: false,
      details: {
        phase: input.phase,
        configPath: input.configPath,
        reason: "json-parse-failed",
        message: error instanceof Error ? error.message : String(error),
      },
    } satisfies DomainError);
  }
}

function upsertJsonNamedEntry(input: {
  readonly root: Record<string, unknown>;
  readonly collectionKey: string;
  readonly serverName: string;
  readonly entry: Record<string, unknown>;
  readonly configPath: string;
  readonly phase: string;
  readonly code: string;
  readonly message: string;
}): Result<Record<string, unknown>> {
  const existingCollection = input.root[input.collectionKey];
  if (existingCollection === undefined) {
    return ok({
      ...input.root,
      [input.collectionKey]: {
        [input.serverName]: input.entry,
      },
    });
  }
  if (!isPlainObject(existingCollection)) {
    return err({
      code: input.code,
      category: "user",
      message: input.message,
      retryable: false,
      details: {
        phase: input.phase,
        configPath: input.configPath,
        reason: "json-collection-not-object",
        collectionKey: input.collectionKey,
      },
    } satisfies DomainError);
  }

  return ok({
    ...input.root,
    [input.collectionKey]: {
      ...existingCollection,
      [input.serverName]: input.entry,
    },
  });
}

function mcpEntryEquals(existing: unknown, next: Record<string, unknown>): boolean {
  if (!isPlainObject(existing)) {
    return false;
  }
  const keys = new Set([...Object.keys(existing), ...Object.keys(next)]);
  for (const key of keys) {
    if (JSON.stringify(existing[key]) !== JSON.stringify(next[key])) {
      return false;
    }
  }
  return true;
}

function existingNamedEntryEquals(input: {
  readonly root: Record<string, unknown>;
  readonly collectionKey: string;
  readonly serverName: string;
  readonly entry: Record<string, unknown>;
}): boolean {
  const collection = input.root[input.collectionKey];
  if (!isPlainObject(collection)) {
    return false;
  }
  return mcpEntryEquals(collection[input.serverName], input.entry);
}

async function writeOwnerOnlyFile(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, contents, { mode: 0o600 });
  await chmod(path, 0o600).catch(() => undefined);
}

export function profileNotFoundError(input: {
  readonly profileName: string;
  readonly phase: string;
  readonly message: string;
}): DomainError {
  return {
    code: "control_plane_profile_not_found",
    category: "user",
    message: input.message,
    retryable: false,
    details: {
      phase: input.phase,
      profile: input.profileName,
    },
  };
}

function resolveSelectedMcpProfile(input: {
  readonly requestedName: string | undefined;
  readonly activeProfile: string | undefined;
  readonly profiles: Readonly<Record<string, CliControlPlaneProfile>>;
  readonly defaultName?: string;
}):
  | { readonly kind: "missing"; readonly profileName: string }
  | { readonly kind: "found"; readonly profile: CliControlPlaneProfile } {
  const profileName = input.requestedName ?? input.activeProfile ?? input.defaultName;
  if (!profileName) {
    return { kind: "missing", profileName: input.requestedName ?? "" };
  }
  const profile = input.profiles[profileName];
  if (!profile) {
    return { kind: "missing", profileName };
  }
  return { kind: "found", profile };
}

export function resolveCursorHome(input: {
  readonly explicit?: string | undefined;
  readonly env?: CliControlPlaneEnvironment | undefined;
  readonly home: string;
}): string {
  return input.explicit?.trim() || input.env?.CURSOR_HOME?.trim() || join(input.home, ".cursor");
}

export function resolveOpenCodeHome(input: {
  readonly explicit?: string | undefined;
  readonly env?: CliControlPlaneEnvironment | undefined;
  readonly home: string;
}): string {
  const xdgConfigHome = input.env?.XDG_CONFIG_HOME?.trim() ?? "";
  return (
    input.explicit?.trim() ||
    (xdgConfigHome ? join(xdgConfigHome, "opencode") : join(input.home, ".config", "opencode"))
  );
}

export function resolveCodexHome(input: {
  readonly explicit?: string | undefined;
  readonly env?: CliControlPlaneEnvironment | undefined;
  readonly home: string;
}): string {
  return input.explicit?.trim() || input.env?.CODEX_HOME?.trim() || join(input.home, ".codex");
}

export function resolveClaudeHome(input: {
  readonly explicit?: string | undefined;
  readonly env?: CliControlPlaneEnvironment | undefined;
  readonly home: string;
}): string {
  return input.explicit?.trim() || input.env?.CLAUDE_HOME?.trim() || join(input.home, ".claude");
}

export function resolveAgentsHome(input: {
  readonly explicit?: string | undefined;
  readonly env?: CliControlPlaneEnvironment | undefined;
  readonly home: string;
}): string {
  return input.explicit?.trim() || input.env?.AGENTS_HOME?.trim() || join(input.home, ".agents");
}

export function resolveClaudeJsonPath(input: { readonly home: string }): string {
  return join(input.home, ".claude.json");
}

async function installJsonMcpNamedHost(input: {
  readonly store: CliControlPlaneProfileStore;
  readonly requestedProfile?: string | undefined;
  readonly serverName: string;
  readonly command: string;
  readonly configPath: string;
  readonly collectionKey: string;
  readonly entryForArgs: (args: readonly string[]) => Record<string, unknown>;
  readonly schemaVersion: string;
  readonly phase: string;
  readonly code: string;
  readonly parseMessage: string;
  readonly collectionMessage: string;
  readonly writeMessage: string;
  readonly profileMissingMessage: string;
}): Promise<Result<McpHostInstallReport, DomainError>> {
  const storeData = await input.store.read();
  if (storeData.isErr()) {
    return err(storeData.error);
  }

  const selected = resolveSelectedMcpProfile({
    requestedName: input.requestedProfile,
    activeProfile: storeData.value.activeProfile,
    profiles: storeData.value.profiles,
  });
  if (selected.kind === "missing") {
    return err(
      profileNotFoundError({
        profileName: selected.profileName,
        phase: input.phase,
        message: input.profileMissingMessage,
      }),
    );
  }
  const argsForConfig = mcpRemoteStdioArgs(selected.profile.name);
  const entry = input.entryForArgs(argsForConfig);
  const existing = existsSync(input.configPath) ? await readFile(input.configPath, "utf8") : "";
  const parsedRoot = parseJsonObjectFile({
    existing,
    configPath: input.configPath,
    phase: input.phase,
    code: input.code,
    message: input.parseMessage,
  });
  if (parsedRoot.isErr()) {
    return err(parsedRoot.error);
  }
  if (
    existingNamedEntryEquals({
      root: parsedRoot.value,
      collectionKey: input.collectionKey,
      serverName: input.serverName,
      entry,
    })
  ) {
    return ok({
      schemaVersion: input.schemaVersion,
      serverName: input.serverName,
      configPath: input.configPath,
      command: input.command,
      args: argsForConfig,
      skipped: true,
      profile: redactedMcpInstallProfile(selected.profile),
    });
  }
  const nextRoot = upsertJsonNamedEntry({
    root: parsedRoot.value,
    collectionKey: input.collectionKey,
    serverName: input.serverName,
    entry,
    configPath: input.configPath,
    phase: input.phase,
    code: input.code,
    message: input.collectionMessage,
  });
  if (nextRoot.isErr()) {
    return err(nextRoot.error);
  }

  try {
    await writeOwnerOnlyFile(input.configPath, `${JSON.stringify(nextRoot.value, null, 2)}\n`);
    return ok({
      schemaVersion: input.schemaVersion,
      serverName: input.serverName,
      configPath: input.configPath,
      command: input.command,
      args: argsForConfig,
      profile: redactedMcpInstallProfile(selected.profile),
    });
  } catch (error) {
    return err({
      code: input.code,
      category: "infra",
      message: input.writeMessage,
      retryable: true,
      details: {
        phase: input.phase,
        configPath: input.configPath,
        message: error instanceof Error ? error.message : String(error),
      },
    } satisfies DomainError);
  }
}

export async function installCursorMcpHost(
  input: McpHostInstallOptions & { readonly cursorHome: string },
): Promise<Result<McpHostInstallReport, DomainError>> {
  const serverName = input.serverName ?? "appaloft";
  const command = input.command ?? "appaloft";
  return installJsonMcpNamedHost({
    store: input.store,
    requestedProfile: input.requestedProfile,
    serverName,
    command,
    configPath: join(input.cursorHome, "mcp.json"),
    collectionKey: "mcpServers",
    entryForArgs: (args) => ({
      command,
      args: [...args],
    }),
    schemaVersion: CURSOR_MCP_INSTALL_SCHEMA_VERSION,
    phase: "cursor-mcp-install",
    code: "cursor_mcp_config_write_failed",
    parseMessage: "Cursor MCP config could not be parsed as a JSON object",
    collectionMessage: "Cursor MCP config mcpServers must be a JSON object",
    writeMessage: "Cursor MCP config could not be written",
    profileMissingMessage:
      "Appaloft CLI profile was not found; run appaloft login or appaloft auth mcp login first",
  });
}

export async function installClaudeCodeMcpHost(
  input: McpHostInstallOptions & { readonly home: string },
): Promise<Result<McpHostInstallReport, DomainError>> {
  const serverName = input.serverName ?? "appaloft";
  const command = input.command ?? "appaloft";
  return installJsonMcpNamedHost({
    store: input.store,
    requestedProfile: input.requestedProfile,
    serverName,
    command,
    configPath: resolveClaudeJsonPath({ home: input.home }),
    collectionKey: "mcpServers",
    entryForArgs: (args) => ({
      command,
      args: [...args],
    }),
    schemaVersion: CLAUDE_CODE_MCP_INSTALL_SCHEMA_VERSION,
    phase: "claude-code-mcp-install",
    code: "claude_mcp_config_write_failed",
    parseMessage: "Claude Code MCP config could not be parsed as a JSON object",
    collectionMessage: "Claude Code MCP config mcpServers must be a JSON object",
    writeMessage: "Claude Code MCP config could not be written",
    profileMissingMessage:
      "Appaloft CLI profile was not found; run appaloft login or appaloft auth mcp login first",
  });
}

export async function installOpenCodeMcpHost(
  input: McpHostInstallOptions & { readonly opencodeHome: string },
): Promise<Result<McpHostInstallReport, DomainError>> {
  const serverName = input.serverName ?? "appaloft";
  const command = input.command ?? "appaloft";
  return installJsonMcpNamedHost({
    store: input.store,
    requestedProfile: input.requestedProfile,
    serverName,
    command,
    configPath: join(input.opencodeHome, "opencode.json"),
    collectionKey: "mcp",
    entryForArgs: (args) => ({
      type: "local",
      command: [command, ...args],
      enabled: true,
    }),
    schemaVersion: OPENCODE_MCP_INSTALL_SCHEMA_VERSION,
    phase: "opencode-mcp-install",
    code: "opencode_mcp_config_write_failed",
    parseMessage: "OpenCode MCP config could not be parsed as a JSON object",
    collectionMessage: "OpenCode MCP config mcp must be a JSON object",
    writeMessage: "OpenCode MCP config could not be written",
    profileMissingMessage:
      "Appaloft CLI profile was not found; run appaloft login or appaloft auth mcp login first",
  });
}

export async function installCodexMcpHost(
  input: McpHostInstallOptions & { readonly codexHome: string },
): Promise<Result<McpHostInstallReport, DomainError>> {
  const profileName = input.requestedProfile ?? "mcp";
  const serverName = input.serverName ?? "appaloft";
  const command = input.command ?? "appaloft";
  const configPath = join(input.codexHome, "config.toml");
  const storeData = await input.store.read();
  if (storeData.isErr()) {
    return err(storeData.error);
  }

  const profile = storeData.value.profiles[profileName];
  if (!profile) {
    return err(
      profileNotFoundError({
        profileName,
        phase: "codex-mcp-install",
        message: "Appaloft MCP profile was not found; run appaloft auth mcp login first",
      }),
    );
  }
  if (profile.auth.kind !== "bearer") {
    return err({
      code: "validation_error",
      category: "user",
      message: "Codex MCP install requires a bearer MCP profile; run appaloft auth mcp login",
      retryable: false,
      details: {
        phase: "codex-mcp-install",
        profile: profileName,
      },
    } satisfies DomainError);
  }

  const argsForConfig = mcpRemoteStdioArgs(profileName);
  try {
    const existing = existsSync(configPath) ? await readFile(configPath, "utf8") : "";
    const next = upsertCodexMcpServerConfig({
      existing,
      serverName,
      command,
      args: argsForConfig,
    });
    await writeOwnerOnlyFile(configPath, next);

    return ok({
      schemaVersion: CODEX_MCP_INSTALL_SCHEMA_VERSION,
      serverName,
      configPath,
      command,
      args: argsForConfig,
      profile: redactedMcpInstallProfile(profile),
    });
  } catch (error) {
    return err({
      code: "codex_mcp_config_write_failed",
      category: "infra",
      message: "Codex MCP config could not be written",
      retryable: true,
      details: {
        phase: "codex-mcp-install",
        configPath,
        message: error instanceof Error ? error.message : String(error),
      },
    } satisfies DomainError);
  }
}
