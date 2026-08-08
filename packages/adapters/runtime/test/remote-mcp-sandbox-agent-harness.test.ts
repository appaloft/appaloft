import { describe, expect, test } from "bun:test";

import {
  createOpenCodeSandboxConfig,
  createPiSandboxArgv,
  createPiSandboxMcpConfig,
} from "../src";

const modelAccess = {
  capabilityId: "model_capability",
  baseUrl: "http://sandbox-gateway.internal/model/v1",
  accessToken: "model-token",
  provider: "appaloft",
  model: "coding-model",
  expiresAt: "2099-01-01T00:00:00.000Z",
};

const mcpAccess = {
  capabilityId: "mcp_capability",
  serverName: "appaloft-tools",
  transport: "streamable-http" as const,
  url: "http://sandbox-gateway.internal/mcp/mcp_capability",
  accessToken: "mcp-token",
  expiresAt: "2099-01-01T00:00:00.000Z",
  effectiveTools: ["projects.list"],
};

describe("Remote MCP Sandbox Agent configuration", () => {
  test("[MCP-ACCESS-HARNESS-005] renders an explicit pinned Pi extension without discovery", () => {
    const argv = createPiSandboxArgv({
      modelAccess,
      mcpExtensionPath: "/opt/appaloft/pi-mcp-extension/index.ts",
      prompt: "Inspect the project",
    });
    const config = JSON.parse(createPiSandboxMcpConfig([mcpAccess])) as {
      schemaVersion: string;
      servers: Array<Record<string, unknown>>;
    };

    expect(argv).toEqual(
      expect.arrayContaining([
        "--no-extensions",
        "--extension",
        "/opt/appaloft/pi-mcp-extension/index.ts",
      ]),
    );
    expect(config).toEqual({
      schemaVersion: "appaloft.pi-mcp/v1",
      servers: [
        {
          name: "appaloft-tools",
          transport: "streamable-http",
          url: mcpAccess.url,
          headers: { Authorization: "Bearer mcp-token" },
          tools: ["projects.list"],
        },
      ],
    });
  });

  test("[MCP-ACCESS-HARNESS-005][MCP-ACCESS-POLICY-006] renders OpenCode remote MCP config", () => {
    const config = JSON.parse(createOpenCodeSandboxConfig(modelAccess, [mcpAccess])) as {
      mcp: Record<string, Record<string, unknown>>;
    };

    expect(config.mcp).toEqual({
      "appaloft-tools": {
        type: "remote",
        url: mcpAccess.url,
        enabled: true,
        oauth: false,
        headers: { Authorization: "Bearer mcp-token" },
      },
    });
    expect(JSON.stringify(config)).not.toContain("projects.delete");
  });
});
