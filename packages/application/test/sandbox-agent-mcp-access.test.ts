import { describe, expect, test } from "bun:test";

import {
  createExecutionContext,
  issueSandboxAgentMcpAccess,
  reconcileSandboxAgentMcpAccessScope,
  type SandboxAgentMcpAccessProvider,
  withOccupancyFirstPartyMcpDiscovery,
} from "../src";

const context = createExecutionContext({
  entrypoint: "http",
  actor: { kind: "user", id: "usr_a" },
  principal: { kind: "user", actorId: "usr_a", userId: "usr_a" },
  tenant: { tenantId: "tenant_a", organizationId: "org_a", subjectId: "usr_a" },
  requestId: "req_mcp",
});

const scope = {
  executionContext: context,
  sandboxId: "sbx_a",
  runtimeId: "sar_a",
  runId: "srun_a",
};

describe("Sandbox Agent MCP access", () => {
  test("[MCP-ACCESS-ISSUE-004][MCP-ACCESS-POLICY-006] accepts only narrowed effective tools", async () => {
    const provider: SandboxAgentMcpAccessProvider = {
      issue: async () => ({
        capabilityId: "mcp_cap_a",
        serverName: "appaloft-tools",
        transport: "streamable-http",
        url: "http://sandbox-gateway.internal/mcp/mcp_cap_a",
        accessToken: "short-lived-token",
        expiresAt: "2026-08-09T01:05:00.000Z",
        effectiveTools: ["projects.list"],
      }),
      revoke: async () => undefined,
      revokeScope: async () => undefined,
    };
    const capabilities = await issueSandboxAgentMcpAccess(provider, scope, [
      {
        requirementId: "appaloft-tools",
        connectionReference: "mcpconn_appaloft",
        required: true,
        purpose: "Read Appaloft state",
        requestedTools: ["projects.list", "workspaces.show"],
      },
    ]);
    expect(capabilities).toMatchObject([
      { serverName: "appaloft-tools", effectiveTools: ["projects.list"] },
    ]);
  });

  test("[MCP-ACCESS-POLICY-006][MCP-ACCESS-REVOKE-007] rejects expansion and revokes prior grants", async () => {
    const revoked: string[] = [];
    let count = 0;
    const provider: SandboxAgentMcpAccessProvider = {
      issue: async () => {
        count += 1;
        return {
          capabilityId: `mcp_cap_${count}`,
          serverName: `server-${count}`,
          transport: "streamable-http",
          url: `http://sandbox-gateway.internal/mcp/mcp_cap_${count}`,
          accessToken: "short-lived-token",
          expiresAt: "2026-08-09T01:05:00.000Z",
          effectiveTools: count === 1 ? ["projects.list"] : ["projects.delete"],
        };
      },
      revoke: async (input) => {
        revoked.push(input.capabilityId);
      },
      revokeScope: async () => undefined,
    };

    await expect(
      issueSandboxAgentMcpAccess(provider, scope, [
        {
          requirementId: "first",
          connectionReference: "mcpconn_first",
          required: true,
          purpose: "First",
          requestedTools: ["projects.list"],
        },
        {
          requirementId: "second",
          connectionReference: "mcpconn_second",
          required: true,
          purpose: "Second",
          requestedTools: ["projects.show"],
        },
      ]),
    ).rejects.toThrow("sandbox_agent_mcp_access_invalid");
    expect(revoked).toEqual(["mcp_cap_1", "mcp_cap_2"]);
  });

  test("[MCP-ACCESS-REVOKE-007] reconciles the exact scope after marker or process loss", async () => {
    const reconciled: string[] = [];
    const provider: SandboxAgentMcpAccessProvider = {
      issue: async () => {
        throw new Error("not used");
      },
      revoke: async () => undefined,
      revokeScope: async (input) => {
        reconciled.push(`${input.sandboxId}:${input.runtimeId}:${input.runId}`);
      },
    };

    await reconcileSandboxAgentMcpAccessScope(provider, scope);
    expect(reconciled).toEqual(["sbx_a:sar_a:srun_a"]);
  });

  test("[WS-REMOTE-MCP-DISCOVERY-021] unions occupancy first-party discovery tools without rewriting tenant MCP", () => {
    expect(
      withOccupancyFirstPartyMcpDiscovery([
        {
          requirementId: "appaloft-tools",
          connectionReference: "appaloft-first-party",
          required: false,
          purpose: "Deploy and inspect Appaloft from occupancy",
          requestedTools: ["projects_list", "deployments_create"],
        },
        {
          requirementId: "docs",
          connectionReference: "mcpconn_docs",
          required: true,
          purpose: "Documentation",
          requestedTools: ["docs.search"],
        },
      ]),
    ).toEqual([
      {
        requirementId: "appaloft-tools",
        connectionReference: "appaloft-first-party",
        required: false,
        purpose: "Deploy and inspect Appaloft from occupancy",
        requestedTools: [
          "projects_list",
          "deployments_create",
          "environments_list",
          "resources_list",
          "resources_show",
          "servers_list",
          "deployments_list",
          "deployments_plan",
          "deployments_show",
          "preview_environments_list",
          "preview_environments_show",
          "sandbox_ports_expose",
          "sandboxes_agent_tasks_deliver",
        ],
      },
      {
        requirementId: "docs",
        connectionReference: "mcpconn_docs",
        required: true,
        purpose: "Documentation",
        requestedTools: ["docs.search"],
      },
    ]);
  });
});
