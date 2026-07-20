import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  CreateSandboxCommand,
  createExecutionContext,
  ListSandboxesQuery,
} from "@appaloft/application";
import { ok } from "@appaloft/core";

import { createOperationToolHandlers, toolContracts } from "../src";

describe("execution sandbox MCP surface", () => {
  test("[SBX-MCP-001] generates bounded tools and dispatches shared messages", async () => {
    const tools = toolContracts.filter(
      (tool) =>
        tool.operationKey.startsWith("sandbox-") || tool.operationKey.startsWith("sandboxes."),
    );
    expect(tools).toHaveLength(26);
    expect(tools.find((tool) => tool.operationKey === "sandbox-files.read")).toMatchObject({
      name: "sandbox_files_read",
      httpRoute: "POST /api/sandboxes/{sandboxId}/files/read",
    });
    expect(tools.find((tool) => tool.operationKey === "sandbox-templates.create")).toMatchObject({
      name: "sandbox_templates_create",
      httpRoute: "POST /api/sandbox-templates",
    });

    const commands: unknown[] = [];
    const queries: unknown[] = [];
    const handlers = createOperationToolHandlers({
      commandBus: {
        execute: async (_context, command) => {
          commands.push(command);
          return ok({ sandboxId: "sbx_mcp", status: "requested" });
        },
      },
      queryBus: {
        execute: async (_context, query) => {
          queries.push(query);
          return ok({ items: [] });
        },
      },
    });
    const context = createExecutionContext({ entrypoint: "mcp", requestId: "req_sandbox_mcp" });
    await handlers.sandboxes_create?.({
      context,
      input: {
        source: { kind: "image", image: "python@sha256:abc123" },
        requestedIsolation: "gvisor",
        limits: {
          cpuMillis: 1_000,
          memoryBytes: 536_870_912,
          diskBytes: 2_147_483_648,
          maxProcesses: 32,
        },
        networkPolicy: { mode: "deny", rules: [] },
      },
    });
    await handlers.sandboxes_list?.({ context, input: { limit: 10 } });

    expect(commands[0]).toBeInstanceOf(CreateSandboxCommand);
    expect(queries[0]).toBeInstanceOf(ListSandboxesQuery);
  });
});
