import { WriteSandboxFileCommand } from "@appaloft/application";
import { type Result } from "@appaloft/core";

export const OCCUPANCY_FIRST_PARTY_MCP_PATH = ".mcp.json";
export const OCCUPANCY_PROJECT_CONTEXT_PATH = ".appaloft/project.md";

/**
 * Secret-free first-party Appaloft MCP for the occupancy disk.
 * The occupancy image ships `appaloft`; login stays in `.appaloft/profiles.json`.
 * Laptop `mcp.json` secrets are never copied.
 */
export const OCCUPANCY_FIRST_PARTY_MCP_CONFIG = {
  mcpServers: {
    appaloft: {
      command: "appaloft",
      args: ["mcp", "stdio"],
    },
  },
} as const;

export const OCCUPANCY_VENDOR_MCP_FILES = [
  { path: OCCUPANCY_FIRST_PARTY_MCP_PATH, kind: "json-mcpServers" },
  { path: ".claude.json", kind: "json-mcpServers" },
  { path: ".grok/config.toml", kind: "toml-mcp-servers" },
  { path: ".codex/config.toml", kind: "toml-mcp-servers" },
] as const;

export function occupancyFirstPartyMcpBytes(): Uint8Array {
  return occupancyMcpFileBytes("json-mcpServers");
}

export function occupancyMcpFileBytes(kind: "json-mcpServers" | "toml-mcp-servers"): Uint8Array {
  if (kind === "toml-mcp-servers") {
    return new TextEncoder().encode(
      `[mcp_servers.appaloft]\ncommand = "appaloft"\nargs = ["mcp", "stdio"]\n`,
    );
  }
  return new TextEncoder().encode(`${JSON.stringify(OCCUPANCY_FIRST_PARTY_MCP_CONFIG, null, 2)}\n`);
}

export function occupancyProjectContextMarkdown(input: {
  readonly projectName?: string;
  readonly projectId?: string;
  readonly resources?: readonly {
    readonly name: string;
    readonly kind?: string;
    readonly source?: string;
  }[];
}): string {
  const lines = [
    "# Appaloft Project",
    "",
    "This session is bound to an Appaloft Project. The git remote is one Resource source, not the Project.",
    "",
  ];
  if (input.projectName) lines.push(`- Project name: ${input.projectName}`);
  if (input.projectId) lines.push(`- Project id: ${input.projectId}`);
  if (input.resources && input.resources.length > 0) {
    lines.push("", "Resources:");
    for (const resource of input.resources) {
      const bits = [resource.name];
      if (resource.kind) bits.push(resource.kind);
      if (resource.source) bits.push(resource.source);
      lines.push(`- ${bits.join(" · ")}`);
    }
  } else {
    lines.push("", "No Resources listed yet. Use Appaloft MCP or `appaloft resource list`.");
  }
  lines.push(
    "",
    "For “what project am I in?”, call Appaloft MCP / `appaloft project show` and `appaloft resource list`. Do not answer from git remotes alone.",
    "",
  );
  return lines.join("\n");
}

async function writeOccupancyFile(input: {
  readonly workspaceId: string;
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly executeCommand: (command: WriteSandboxFileCommand) => Promise<Result<unknown>>;
  readonly destinationExists?: (path: string) => Promise<boolean>;
}): Promise<boolean> {
  if (input.destinationExists && (await input.destinationExists(input.path))) {
    return true;
  }
  const command = WriteSandboxFileCommand.create({
    sandboxId: input.workspaceId,
    path: input.path,
    contentBase64: Buffer.from(input.bytes).toString("base64"),
  });
  if (command.isErr()) return false;
  const written = await input.executeCommand(command.value);
  return written.isOk();
}

export async function offerOccupancyFirstPartyMcp(input: {
  readonly workspaceId: string;
  readonly executeCommand: (command: WriteSandboxFileCommand) => Promise<Result<unknown>>;
  readonly destinationExists?: (path: string) => Promise<boolean>;
  readonly projectName?: string;
  readonly projectId?: string;
  readonly resources?: readonly {
    readonly name: string;
    readonly kind?: string;
    readonly source?: string;
  }[];
}): Promise<{ readonly offered: boolean; readonly occupancyPath: string }> {
  let offered = false;
  for (const file of OCCUPANCY_VENDOR_MCP_FILES) {
    const wrote = await writeOccupancyFile({
      workspaceId: input.workspaceId,
      path: file.path,
      bytes: occupancyMcpFileBytes(file.kind),
      executeCommand: input.executeCommand,
      ...(input.destinationExists ? { destinationExists: input.destinationExists } : {}),
    });
    if (wrote && file.path === OCCUPANCY_FIRST_PARTY_MCP_PATH) offered = true;
  }
  if (input.projectName || input.projectId) {
    await writeOccupancyFile({
      workspaceId: input.workspaceId,
      path: OCCUPANCY_PROJECT_CONTEXT_PATH,
      bytes: new TextEncoder().encode(
        occupancyProjectContextMarkdown({
          ...(input.projectName ? { projectName: input.projectName } : {}),
          ...(input.projectId ? { projectId: input.projectId } : {}),
          ...(input.resources ? { resources: input.resources } : {}),
        }),
      ),
      executeCommand: input.executeCommand,
      ...(input.destinationExists ? { destinationExists: input.destinationExists } : {}),
    });
  }
  return {
    offered,
    occupancyPath: OCCUPANCY_FIRST_PARTY_MCP_PATH,
  };
}
