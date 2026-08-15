import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type Command,
  type CommandBus,
  CreateSandboxCommand,
  CreateSandboxTemplateCommand,
  createExecutionContext,
  ExecuteSandboxCommand,
  type ExecutionContextFactory,
  ListSandboxesQuery,
  OpenTerminalSessionCommand,
  type Query,
  type QueryBus,
  WriteSandboxFileCommand,
} from "@appaloft/application";
import { COMMUNITY_REMOTE_DEFAULT_NETWORK_POLICY } from "@appaloft/application/community-remote-default-network-policy";
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
      await program.parseAsync([
        "node",
        "appaloft",
        "sandbox",
        "terminal",
        "sbx_cli",
        "--directory",
        "app",
        "--rows",
        "32",
        "--cols",
        "120",
      ]);
    } finally {
      process.stdout.write = write;
    }

    expect(commands[0]).toBeInstanceOf(CreateSandboxCommand);
    expect(queries[0]).toBeInstanceOf(ListSandboxesQuery);
    expect(commands[1]).toBeInstanceOf(ExecuteSandboxCommand);
    expect(commands[1]).toMatchObject({ input: { argv: ["python", "-V"] } });
    expect(commands[2]).toBeInstanceOf(WriteSandboxFileCommand);
    expect(commands[3]).toBeInstanceOf(OpenTerminalSessionCommand);
    expect(commands[3]).toMatchObject({
      scope: {
        kind: "sandbox",
        sandboxId: "sbx_cli",
      },
      relativeDirectory: "app",
      initialRows: 32,
      initialCols: 120,
    });
  });

  test("[WS-REMOTE-AUTH-009] sandbox template create can register the remote-default allowlist", async () => {
    const commands: Command<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: Command<T>) => {
        commands.push(command as Command<unknown>);
        return ok({ templateId: "stp_cli" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>() => ok({ items: [] } as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) => createExecutionContext({ ...input, requestId: "req_template_cli" }),
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
        "template",
        "create",
        "--name",
        "occupancy-opencode-remote-default",
        "--image",
        "ghcr.io/appaloft/agent-workspace-opencode:1.18.4",
        "--isolation",
        "container-trusted",
        "--cpu-millis",
        "2000",
        "--memory-bytes",
        "4294967296",
        "--disk-bytes",
        "21474836480",
        "--max-processes",
        "128",
        "--network-policy",
        "remote-default",
      ]);
    } finally {
      process.stdout.write = write;
    }
    expect(commands[0]).toBeInstanceOf(CreateSandboxTemplateCommand);
    expect(commands[0]).toMatchObject({
      input: { networkPolicy: COMMUNITY_REMOTE_DEFAULT_NETWORK_POLICY },
    });
  });
});
