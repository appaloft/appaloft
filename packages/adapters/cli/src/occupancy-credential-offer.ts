import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { WriteSandboxFileCommand } from "@appaloft/application";
import { type Result } from "@appaloft/core";

import { type OccupancyVendor, occupancyAppaloftHome } from "./occupancy-vendor.js";

export const OCCUPANCY_CREDENTIAL_MAX_FILE_BYTES = 64 * 1024;

export const OCCUPANCY_VENDOR_CREDENTIAL_PATHS = {
  grok: {
    kind: "auth.json" as const,
    occupancyRelative: ".grok/auth.json",
  },
  codex: {
    kind: "auth.json" as const,
    occupancyRelative: ".codex/auth.json",
  },
  claude: {
    kind: "setup-token" as const,
    occupancyRelative: ".claude/setup-token",
  },
} as const;
export const OCCUPANCY_OPENCODE_CONNECT_PATH = ".local/share/opencode/auth.json";

export async function loadOccupancyOpenCodeConnectAuth(
  input: {
    readonly homeDir?: string;
    readonly env?: NodeJS.ProcessEnv;
  } = {},
): Promise<OccupancyCredentialFile | undefined> {
  const homeDir = input.homeDir ?? homedir();
  const env = input.env ?? process.env;
  const dataHome = env.XDG_DATA_HOME?.trim() || join(homeDir, ".local", "share");
  const content = await readBoundedFile(join(dataHome, "opencode", "auth.json"));
  if (!content) return undefined;
  return {
    occupancyPath: OCCUPANCY_OPENCODE_CONNECT_PATH,
    kind: "auth.json",
    content,
  };
}

export async function offerOccupancyOpenCodeConnectAuth(input: {
  readonly workspaceId: string;
  readonly executeCommand: (command: WriteSandboxFileCommand) => Promise<Result<unknown>>;
  readonly destinationExists: (relativePath: string) => Promise<boolean>;
  readonly homeDir?: string;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<{
  readonly offered: boolean;
  readonly occupancyPath?: string;
  readonly kind?: "auth.json";
}> {
  const loaded = await loadOccupancyOpenCodeConnectAuth(input);
  if (!loaded) return { offered: false };
  if (await input.destinationExists(loaded.occupancyPath)) {
    return { offered: true, occupancyPath: loaded.occupancyPath, kind: "auth.json" };
  }
  const command = WriteSandboxFileCommand.create({
    sandboxId: input.workspaceId,
    path: loaded.occupancyPath,
    contentBase64: Buffer.from(loaded.content).toString("base64"),
  });
  if (command.isErr()) return { offered: false };
  const written = await input.executeCommand(command.value);
  if (written.isErr()) return { offered: false };
  return { offered: true, occupancyPath: loaded.occupancyPath, kind: "auth.json" };
}

const CLAUDE_CHAT_COOKIE_BASENAMES = new Set([".credentials.json", "credentials.json"]);

export interface OccupancyCredentialFile {
  readonly occupancyPath: string;
  readonly kind: "auth.json" | "setup-token";
  readonly content: Uint8Array;
}

export function isOccupancyClaudeChatCookiePath(relativePath: string): boolean {
  const base = relativePath.replaceAll("\\", "/").split("/").pop()?.toLowerCase() ?? "";
  return CLAUDE_CHAT_COOKIE_BASENAMES.has(base);
}

async function readBoundedFile(path: string): Promise<Uint8Array | undefined> {
  const info = await stat(path).catch(() => undefined);
  if (!info?.isFile() || info.size > OCCUPANCY_CREDENTIAL_MAX_FILE_BYTES) return undefined;
  return readFile(path);
}

export async function loadOccupancyVendorCredential(
  vendor: OccupancyVendor,
  input: {
    readonly homeDir?: string;
    readonly env?: NodeJS.ProcessEnv;
  } = {},
): Promise<OccupancyCredentialFile | undefined> {
  const homeDir = input.homeDir ?? homedir();
  const env = input.env ?? process.env;
  const destination = OCCUPANCY_VENDOR_CREDENTIAL_PATHS[vendor];

  if (vendor === "grok" || vendor === "codex") {
    const laptopPath = join(homeDir, vendor === "grok" ? ".grok" : ".codex", "auth.json");
    const content = await readBoundedFile(laptopPath);
    if (!content) return undefined;
    return {
      occupancyPath: destination.occupancyRelative,
      kind: destination.kind,
      content,
    };
  }

  const envToken = env.CLAUDE_CODE_OAUTH_TOKEN?.trim();
  if (envToken) {
    return {
      occupancyPath: destination.occupancyRelative,
      kind: destination.kind,
      content: new TextEncoder().encode(`${envToken}\n`),
    };
  }

  const candidates = [
    join(occupancyAppaloftHome(homeDir, env), "claude-setup-token"),
    join(homeDir, ".claude", "setup-token"),
  ];
  for (const laptopPath of candidates) {
    if (isOccupancyClaudeChatCookiePath(laptopPath)) continue;
    const content = await readBoundedFile(laptopPath);
    if (!content) continue;
    return {
      occupancyPath: destination.occupancyRelative,
      kind: destination.kind,
      content,
    };
  }
  return undefined;
}

export async function offerOccupancyVendorCredential(input: {
  readonly workspaceId: string;
  readonly vendor: OccupancyVendor;
  readonly homeDir?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly executeCommand: (command: WriteSandboxFileCommand) => Promise<Result<unknown>>;
  readonly destinationExists?: (path: string) => Promise<boolean>;
}): Promise<{
  readonly offered: boolean;
  readonly occupancyPath?: string;
  readonly kind?: "auth.json" | "setup-token";
}> {
  const file = await loadOccupancyVendorCredential(input.vendor, {
    ...(input.homeDir ? { homeDir: input.homeDir } : {}),
    ...(input.env ? { env: input.env } : {}),
  });
  if (!file) return { offered: false };

  if (input.destinationExists && (await input.destinationExists(file.occupancyPath))) {
    return { offered: true, occupancyPath: file.occupancyPath, kind: file.kind };
  }

  const command = WriteSandboxFileCommand.create({
    sandboxId: input.workspaceId,
    path: file.occupancyPath,
    contentBase64: Buffer.from(file.content).toString("base64"),
  });
  if (command.isErr()) return { offered: false };
  const written = await input.executeCommand(command.value);
  if (written.isErr()) return { offered: false };
  return { offered: true, occupancyPath: file.occupancyPath, kind: file.kind };
}
