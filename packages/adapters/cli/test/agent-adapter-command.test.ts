import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  createExecutionContext,
  DisableAgentAdapterCommand,
  type ExecutionContextFactory,
  InstallAgentAdapterCommand,
  ListAgentAdaptersQuery,
  type QueryBus,
  ShowAgentAdapterQuery,
  UninstallAgentAdapterCommand,
  ValidateAgentAdapterQuery,
} from "@appaloft/application";
import { ok } from "@appaloft/core";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const path of tempDirectories.splice(0)) {
    rmSync(path, { force: true, recursive: true });
  }
});

describe("Agent Adapter CLI commands", () => {
  test("[ADAPTER-SURFACE-011] maps lifecycle commands and queries to application messages", async () => {
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const queries: AppQuery<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({} as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok({} as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_agent_adapter_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });
    const directory = mkdtempSync(join(tmpdir(), "appaloft-agent-adapter-"));
    tempDirectories.push(directory);
    const manifestPath = join(directory, "adapter.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        schemaVersion: "appaloft.agent-adapter/v1",
        id: "opencode",
        displayName: "OpenCode",
        version: "1.0.0",
        kind: "declarative",
        requirements: {
          adapterApi: "^1.0.0",
          sandboxTemplate: {
            id: "agent-workspace",
            version: "^1.0.0",
            digest: `sha256:${"1".repeat(64)}`,
          },
          runtimes: [{ id: "opencode", version: "^1.0.0" }],
          capabilities: { required: ["managed-terminal"], optional: [] },
        },
        interactionModes: [
          {
            id: "terminal",
            transport: "terminal",
            command: ["opencode"],
            eventFidelity: "raw-pty",
            sessionRecovery: "native-session",
          },
        ],
        persistentPaths: ["/workspace/.local/share/opencode"],
        healthcheck: { kind: "process" },
        credentials: [],
      }),
    );

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync(["node", "appaloft", "agent-adapter", "validate", manifestPath]);
      await program.parseAsync(["node", "appaloft", "agent-adapter", "install", manifestPath]);
      await program.parseAsync(["node", "appaloft", "agent-adapter", "list", "--limit", "20"]);
      await program.parseAsync(["node", "appaloft", "agent-adapter", "show", "aai_example"]);
      await program.parseAsync(["node", "appaloft", "agent-adapter", "disable", "aai_example"]);
      await program.parseAsync(["node", "appaloft", "agent-adapter", "uninstall", "aai_example"]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries.map((query) => query.constructor)).toEqual([
      ValidateAgentAdapterQuery,
      ListAgentAdaptersQuery,
      ShowAgentAdapterQuery,
    ]);
    expect(commands.map((command) => command.constructor)).toEqual([
      InstallAgentAdapterCommand,
      DisableAgentAdapterCommand,
      UninstallAgentAdapterCommand,
    ]);
    expect((queries[1] as ListAgentAdaptersQuery).input).toEqual({ limit: 20 });
    expect((commands[0] as InstallAgentAdapterCommand).input.manifest).toMatchObject({
      id: "opencode",
      version: "1.0.0",
    });
  });
});
