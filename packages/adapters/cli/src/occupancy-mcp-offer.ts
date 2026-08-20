import { WriteSandboxFileCommand } from "@appaloft/application";
import { type Result } from "@appaloft/core";

export const OCCUPANCY_FIRST_PARTY_MCP_PATH = ".mcp.json";

/**
 * Secret-free first-party Appaloft MCP for the occupancy disk.
 * Laptop `mcp.json` secrets are never copied. In-sandbox agents use stdio;
 * laptop native-attach continues to inject `mcp remote-stdio`.
 */
export const OCCUPANCY_FIRST_PARTY_MCP_CONFIG = {
  mcpServers: {
    appaloft: {
      command: "appaloft",
      args: ["mcp", "stdio"],
    },
  },
} as const;

export function occupancyFirstPartyMcpBytes(): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(OCCUPANCY_FIRST_PARTY_MCP_CONFIG, null, 2)}\n`);
}

export async function offerOccupancyFirstPartyMcp(input: {
  readonly workspaceId: string;
  readonly executeCommand: (command: WriteSandboxFileCommand) => Promise<Result<unknown>>;
  readonly destinationExists?: (path: string) => Promise<boolean>;
}): Promise<{ readonly offered: boolean; readonly occupancyPath: string }> {
  if (input.destinationExists && (await input.destinationExists(OCCUPANCY_FIRST_PARTY_MCP_PATH))) {
    return { offered: true, occupancyPath: OCCUPANCY_FIRST_PARTY_MCP_PATH };
  }
  const command = WriteSandboxFileCommand.create({
    sandboxId: input.workspaceId,
    path: OCCUPANCY_FIRST_PARTY_MCP_PATH,
    contentBase64: Buffer.from(occupancyFirstPartyMcpBytes()).toString("base64"),
  });
  if (command.isErr()) return { offered: false, occupancyPath: OCCUPANCY_FIRST_PARTY_MCP_PATH };
  const written = await input.executeCommand(command.value);
  return {
    offered: written.isOk(),
    occupancyPath: OCCUPANCY_FIRST_PARTY_MCP_PATH,
  };
}
