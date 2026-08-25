import { WriteSandboxFileCommand } from "@appaloft/application";
import { type Result } from "@appaloft/core";

import {
  type OccupancyAppaloftLogin,
  occupancyControlPlaneMcpUrl,
  occupancyMcpAuthHeader,
} from "./occupancy-login-offer.js";

export const OCCUPANCY_FIRST_PARTY_MCP_PATH = ".mcp.json";
export const OCCUPANCY_PROJECT_CONTEXT_PATH = ".appaloft/project.md";

/**
 * Secret-free first-party Appaloft MCP for the occupancy disk when no
 * control-plane login is offered. Laptop `mcp.json` secrets are never copied.
 * With a login, vendor MCP uses Streamable HTTP against the control-plane
 * `/mcp` so Grok/Codex do not need an `appaloft` binary on the image.
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

function tomlQuoted(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function occupancyFirstPartyMcpBytes(login?: OccupancyAppaloftLogin): Uint8Array {
  return occupancyMcpFileBytes("json-mcpServers", login);
}

export function occupancyMcpFileBytes(
  kind: "json-mcpServers" | "toml-mcp-servers",
  login?: OccupancyAppaloftLogin,
): Uint8Array {
  if (login) {
    const url = occupancyControlPlaneMcpUrl(login.baseUrl);
    const header = occupancyMcpAuthHeader(login.auth);
    if (kind === "toml-mcp-servers") {
      return new TextEncoder().encode(
        `[mcp_servers.appaloft]\nurl = ${tomlQuoted(url)}\nheaders = { ${header.name} = ${tomlQuoted(header.value)} }\n`,
      );
    }
    return new TextEncoder().encode(
      `${JSON.stringify(
        {
          mcpServers: {
            appaloft: {
              url,
              headers: { [header.name]: header.value },
            },
          },
        },
        null,
        2,
      )}\n`,
    );
  }
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
  readonly login?: OccupancyAppaloftLogin;
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
      bytes: occupancyMcpFileBytes(file.kind, input.login),
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
