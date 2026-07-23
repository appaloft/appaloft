import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type Command,
  type CommandBus,
  CreateSandboxAgentRuntimeCommand,
  CreateSandboxCommand,
  createExecutionContext,
  type ExecutionContextFactory,
  ListSandboxAgentRuntimesQuery,
  ListSandboxesQuery,
  type Query,
  type QueryBus,
  ShowSandboxQuery,
} from "@appaloft/application";
import { err, ok } from "@appaloft/core";

describe("Agent Workspace CLI", () => {
  test("[AGENT-WS-CLI-012] creates Pi and OpenCode Workspaces through canonical public commands", async () => {
    const commands: Command<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: Command<T>) => {
        commands.push(command as Command<unknown>);
        if (command instanceof CreateSandboxCommand) {
          return ok({ sandboxId: `sbx_ws_${commands.length}`, status: "ready" } as T);
        }
        return ok({
          sandboxId: `sbx_ws_${commands.length - 1}`,
          runtimeId: `sar_ws_${commands.length}`,
          status: "ready",
        } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: Query<T>) => ok({ items: [] } as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) => createExecutionContext({ ...input, requestId: "req_workspace_cli" }),
    };
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });
    const write = process.stdout.write;
    process.stdout.write = (() => true) as typeof process.stdout.write;
    try {
      for (const harness of ["pi", "opencode"] as const) {
        await program.parseAsync([
          "node",
          "appaloft",
          "workspace",
          "create",
          "--harness",
          harness,
          "--sandbox-template",
          `sbt_${harness}`,
          "--isolation",
          "gvisor",
          "--cpu-millis",
          "1000",
          "--memory-bytes",
          "536870912",
          "--disk-bytes",
          "2147483648",
          "--max-processes",
          "32",
        ]);
      }
    } finally {
      process.stdout.write = write;
    }

    expect(commands[0]).toBeInstanceOf(CreateSandboxCommand);
    expect(commands[1]).toBeInstanceOf(CreateSandboxAgentRuntimeCommand);
    expect(commands[1]).toMatchObject({
      input: {
        sandboxId: "sbx_ws_1",
        harnessKey: "pi",
        harnessTemplateId: "aht_pi_managed_v1",
      },
    });
    expect(commands[2]).toBeInstanceOf(CreateSandboxCommand);
    expect(commands[3]).toBeInstanceOf(CreateSandboxAgentRuntimeCommand);
    expect(commands[3]).toMatchObject({
      input: {
        sandboxId: "sbx_ws_3",
        harnessKey: "opencode",
        harnessTemplateId: "aht_opencode_managed_v1",
      },
    });
  });

  test("[AGENT-WS-FLOW-003] lists and shows Workspace views without a Workspace repository", async () => {
    const queries: Query<unknown>[] = [];
    const queryBus = {
      execute: async <T>(_context: unknown, query: Query<T>) => {
        queries.push(query as Query<unknown>);
        if (query instanceof ListSandboxesQuery) {
          return ok({ items: [{ sandboxId: "sbx_workspace", status: "ready" }] } as T);
        }
        if (query instanceof ShowSandboxQuery) {
          return ok({ sandboxId: "sbx_workspace", status: "ready" } as T);
        }
        return ok({
          items: [
            {
              sandboxId: "sbx_workspace",
              runtimeId: "sar_workspace",
              harnessKey: "opencode",
              status: "ready",
            },
          ],
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) => createExecutionContext({ ...input, requestId: "req_workspace_read_cli" }),
    };
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: { execute: async () => ok(undefined) } as unknown as CommandBus,
      queryBus,
      executionContextFactory,
    });
    const write = process.stdout.write;
    process.stdout.write = (() => true) as typeof process.stdout.write;
    try {
      await program.parseAsync(["node", "appaloft", "workspace", "list"]);
      await program.parseAsync(["node", "appaloft", "workspace", "show", "sbx_workspace"]);
    } finally {
      process.stdout.write = write;
    }

    expect(queries.filter((query) => query instanceof ListSandboxesQuery)).toHaveLength(1);
    expect(queries.filter((query) => query instanceof ShowSandboxQuery)).toHaveLength(1);
    expect(queries.filter((query) => query instanceof ListSandboxAgentRuntimesQuery)).toHaveLength(
      2,
    );
  });

  test("[AGENT-WS-CLI-012] preserves partial Workspace recovery evidence", async () => {
    const commandBus = {
      execute: async <T>(_context: unknown, command: Command<T>) => {
        if (command instanceof CreateSandboxCommand) {
          return ok({ sandboxId: "sbx_partial", status: "ready" } as T);
        }
        return err({
          code: "sandbox_agent_harness_unavailable",
          category: "user",
          message: "OpenCode harness is not configured",
          retryable: false,
          details: {},
        });
      },
    } as unknown as CommandBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) => createExecutionContext({ ...input, requestId: "req_workspace_partial" }),
    };
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus: { execute: async () => ok({ items: [] }) } as unknown as QueryBus,
      executionContextFactory,
    });

    const originalExitCode = process.exitCode;
    const write = process.stderr.write;
    process.stderr.write = (() => true) as typeof process.stderr.write;
    try {
      await program.parseAsync([
        "node",
        "appaloft",
        "workspace",
        "create",
        "--harness",
        "opencode",
        "--sandbox-template",
        "sbt_opencode",
        "--isolation",
        "gvisor",
        "--cpu-millis",
        "1000",
        "--memory-bytes",
        "536870912",
        "--disk-bytes",
        "2147483648",
        "--max-processes",
        "32",
      ]);
      throw new Error("Expected partial Workspace creation to fail");
    } catch (error) {
      const errorText = String(error);
      expect(errorText).toContain('"code":"sandbox_agent_harness_unavailable"');
      expect(errorText).toContain('"phase":"agent-workspace-runtime-create"');
      expect(errorText).toContain('"workspaceId":"sbx_partial"');
      expect(errorText).toContain('"sandboxId":"sbx_partial"');
      expect(errorText).toContain('"harness":"opencode"');
    } finally {
      process.stderr.write = write;
      process.exitCode = originalExitCode ?? 0;
    }
  });
});
