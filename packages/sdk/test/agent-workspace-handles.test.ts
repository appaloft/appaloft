import { describe, expect, test } from "bun:test";

import {
  AppaloftWorkspaceCreateError,
  createAppaloftClient,
  defaultOpenCodeHarnessTemplateId,
} from "../src";

const sandboxInput = {
  source: { kind: "template", templateId: "sbt_opencode" },
  requestedIsolation: "gvisor",
  limits: {
    cpuMillis: 1_000,
    memoryBytes: 256 * 1024 * 1024,
    diskBytes: 512 * 1024 * 1024,
    maxProcesses: 16,
  },
  networkPolicy: { mode: "deny", rules: [] },
} as const;

describe("Agent Workspace SDK handles", () => {
  test("[AGENT-WS-SDK-013] composes Sandbox and OpenCode Runtime creation", async () => {
    const requests: Request[] = [];
    const appaloft = createAppaloftClient({
      baseUrl: "https://appaloft.example/api",
      fetch: async (request) => {
        requests.push(request);
        const path = new URL(request.url).pathname;
        if (path === "/api/sandboxes") {
          return Response.json({ sandboxId: "sbx_workspace", status: "ready" }, { status: 201 });
        }
        if (path === "/api/sandboxes/sbx_workspace/agent-runtimes") {
          return Response.json({
            sandboxId: "sbx_workspace",
            runtimeId: "sar_opencode",
            harnessKey: "opencode",
            status: "ready",
          });
        }
        throw new Error(`Unexpected SDK request ${request.method} ${path}`);
      },
    });

    const workspace = await appaloft.workspaces.create({
      sandbox: sandboxInput,
      harness: "opencode",
    });

    expect(workspace).toMatchObject({
      workspaceId: "sbx_workspace",
      sandboxId: "sbx_workspace",
      agent: {
        runtimeId: "sar_opencode",
        harnessKey: "opencode",
      },
    });
    expect(await requests[1]?.json()).toEqual({
      harnessKey: "opencode",
      harnessTemplateId: defaultOpenCodeHarnessTemplateId,
      idempotencyKey: expect.any(String),
    });
  });

  test("[AGENT-WS-SDK-013] preserves the created Sandbox id when Runtime creation fails", async () => {
    const appaloft = createAppaloftClient({
      baseUrl: "https://appaloft.example/api",
      fetch: async (request) => {
        const path = new URL(request.url).pathname;
        if (path === "/api/sandboxes") {
          return Response.json({ sandboxId: "sbx_partial", status: "ready" }, { status: 201 });
        }
        return Response.json(
          {
            error: {
              code: "sandbox_agent_harness_unavailable",
              category: "user",
              message: "OpenCode harness is not configured",
              retryable: false,
              details: {},
            },
          },
          { status: 422 },
        );
      },
    });

    try {
      await appaloft.workspaces.create({ sandbox: sandboxInput, harness: "opencode" });
      throw new Error("Expected Workspace creation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AppaloftWorkspaceCreateError);
      expect(error).toMatchObject({ workspaceId: "sbx_partial", sandboxId: "sbx_partial" });
    }
  });

  test("[AGENT-WS-FLOW-003] composes list/show from Sandbox and Runtime read models", async () => {
    const appaloft = createAppaloftClient({
      baseUrl: "https://appaloft.example/api",
      fetch: async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/api/sandboxes" && request.method === "GET") {
          return Response.json({
            items: [{ sandboxId: "sbx_workspace", status: "ready" }],
            total: 1,
          });
        }
        if (url.pathname === "/api/sandboxes/sbx_workspace") {
          return Response.json({ sandboxId: "sbx_workspace", status: "ready" });
        }
        if (url.pathname === "/api/sandboxes/sbx_workspace/agent-runtimes") {
          return Response.json({
            items: [
              {
                sandboxId: "sbx_workspace",
                runtimeId: "sar_workspace",
                harnessKey: "opencode",
                status: "ready",
              },
            ],
          });
        }
        throw new Error(`Unexpected SDK request ${request.method} ${url.pathname}`);
      },
    });

    const listed = await appaloft.workspaces.list();
    const shown = await appaloft.workspaces.show("sbx_workspace");

    expect(listed).toMatchObject({
      total: 1,
      items: [
        {
          workspaceId: "sbx_workspace",
          agentRuntimes: [{ runtimeId: "sar_workspace", harnessKey: "opencode" }],
        },
      ],
    });
    expect(shown).toMatchObject({
      workspaceId: "sbx_workspace",
      sandbox: { status: "ready" },
      agentRuntimes: [{ runtimeId: "sar_workspace" }],
    });
  });
});
