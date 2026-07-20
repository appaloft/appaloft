import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type Command,
  type CommandBus,
  CreateSandboxCommand,
  createExecutionContext,
  ExecuteSandboxCommand,
  type ExecutionContextFactory,
  ListSandboxesQuery,
  type Query,
  type QueryBus,
  WriteSandboxFileCommand,
} from "@appaloft/application";
import { ok } from "@appaloft/core";

describe("CLI execution sandbox commands", () => {
  test("[SBX-CLI-001] dispatches lifecycle, exec and file operations through shared messages", async () => {
    const commands: Command<unknown>[] = [];
    const queries: Query<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: Command<T>) => {
        commands.push(command as Command<unknown>);
        return ok({ sandboxId: "sbx_cli" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: Query<T>) => {
        queries.push(query as Query<unknown>);
        return ok({ items: [] } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) => createExecutionContext({ ...input, requestId: "req_sandbox_cli" }),
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
      await program.parseAsync([
        "node",
        "appaloft",
        "sandbox",
        "create",
        "--image",
        "python@sha256:abc123",
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
      await program.parseAsync(["node", "appaloft", "sandbox", "list", "--limit", "10"]);
      await program.parseAsync([
        "node",
        "appaloft",
        "sandbox",
        "exec",
        "sbx_cli",
        "--arg",
        "python",
        "--arg",
        "-V",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "sandbox",
        "file",
        "write",
        "sbx_cli",
        "--path",
        "input.bin",
        "--content-base64",
        "AP8B",
      ]);
    } finally {
      process.stdout.write = write;
    }

    expect(commands[0]).toBeInstanceOf(CreateSandboxCommand);
    expect(queries[0]).toBeInstanceOf(ListSandboxesQuery);
    expect(commands[1]).toBeInstanceOf(ExecuteSandboxCommand);
    expect(commands[1]).toMatchObject({ input: { argv: ["python", "-V"] } });
    expect(commands[2]).toBeInstanceOf(WriteSandboxFileCommand);
  });
});
