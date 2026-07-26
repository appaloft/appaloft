import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  createExecutionContext,
  InstallAgentAdapterCommand,
  ListAgentAdaptersQuery,
} from "@appaloft/application";
import { createOperationToolHandlers, toolContractsByOperationKey } from "../src";

describe("Agent Adapter MCP tools", () => {
  test("[ADAPTER-SURFACE-011] generates descriptors and dispatches shared lifecycle messages", async () => {
    const dispatched: unknown[] = [];
    const handlers = createOperationToolHandlers({
      commandBus: {
        execute: async (_context, command) => {
          dispatched.push(command);
          return { installed: true };
        },
      },
      queryBus: {
        execute: async (_context, query) => {
          dispatched.push(query);
          return [];
        },
      },
    });
    const context = createExecutionContext({
      requestId: "req_agent_adapter_mcp",
      entrypoint: "mcp",
    });

    expect(toolContractsByOperationKey.get("agent-adapters.install")).toMatchObject({
      name: "agent_adapters_install",
      cliCommand: "appaloft agent-adapter install <manifest>",
      httpRoute: "POST /api/agent-adapters",
    });
    await handlers.agent_adapters_install({
      context,
      input: { manifest: { schemaVersion: "appaloft.agent-adapter/v1" } },
    });
    await handlers.agent_adapters_list({ context, input: { limit: 20 } });

    expect(dispatched[0]).toBeInstanceOf(InstallAgentAdapterCommand);
    expect(dispatched[1]).toBeInstanceOf(ListAgentAdaptersQuery);
  });
});
