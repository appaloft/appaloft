import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  CompileAgentWorkspaceProfileQuery,
  createExecutionContext,
  DisableAgentWorkspaceProfileCommand,
  type ExecutionContextFactory,
  InstallAgentWorkspaceProfileCommand,
  ListAgentWorkspaceProfilesQuery,
  type QueryBus,
  ShowAgentWorkspaceProfileQuery,
  UninstallAgentWorkspaceProfileCommand,
  ValidateAgentWorkspaceProfileQuery,
} from "@appaloft/application";
import { ok } from "@appaloft/core";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const path of tempDirectories.splice(0)) {
    rmSync(path, { force: true, recursive: true });
  }
});

describe("Agent Workspace Profile CLI commands", () => {
  test("[PROFILE-MANIFEST-009][ADAPTER-SURFACE-011] maps lifecycle operations to application messages", async () => {
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
          requestId: "req_cli_agent_workspace_profile_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });
    const directory = mkdtempSync(join(tmpdir(), "appaloft-agent-workspace-profile-"));
    tempDirectories.push(directory);
    const manifestPath = join(directory, "profile.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        schemaVersion: "appaloft.agent-workspace-profile/v1",
        id: "codex-standard",
        displayName: "Codex Standard",
        version: "1.0.0",
        adapter: {
          id: "codex-cli",
          version: "1.2.3",
          digest: `sha256:${"a".repeat(64)}`,
          interactiveModeId: "terminal",
          taskModeId: "headless",
        },
        harnessTemplateId: "aht_codex_declarative_v1",
        sandbox: {
          template: {
            id: "node-agent",
            version: "22.4.1",
            digest: `sha256:${"b".repeat(64)}`,
          },
          requestedIsolation: "container-trusted",
          limits: {
            cpuMillis: 2_000,
            memoryBytes: 4_294_967_296,
            diskBytes: 21_474_836_480,
            maxProcesses: 128,
          },
          networkPolicy: { mode: "deny" },
        },
        workingDirectory: "/workspace",
        initialization: [{ id: "verify-codex", argv: ["codex", "--version"] }],
        defaultPorts: [],
        persistentPaths: ["/workspace/.codex"],
        suggestedChecks: [],
      }),
    );

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "agent-workspace-profile",
        "validate",
        manifestPath,
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "agent-workspace-profile",
        "install",
        manifestPath,
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "agent-workspace-profile",
        "list",
        "--limit",
        "20",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "agent-workspace-profile",
        "show",
        "awpi_example",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "agent-workspace-profile",
        "compile",
        "awpi_example",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "agent-workspace-profile",
        "disable",
        "awpi_example",
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "agent-workspace-profile",
        "uninstall",
        "awpi_example",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries.map((query) => query.constructor)).toEqual([
      ValidateAgentWorkspaceProfileQuery,
      ListAgentWorkspaceProfilesQuery,
      ShowAgentWorkspaceProfileQuery,
      CompileAgentWorkspaceProfileQuery,
    ]);
    expect(commands.map((command) => command.constructor)).toEqual([
      InstallAgentWorkspaceProfileCommand,
      DisableAgentWorkspaceProfileCommand,
      UninstallAgentWorkspaceProfileCommand,
    ]);
    expect((queries[1] as ListAgentWorkspaceProfilesQuery).input).toEqual({ limit: 20 });
    expect((commands[0] as InstallAgentWorkspaceProfileCommand).input.manifest).toMatchObject({
      id: "codex-standard",
      version: "1.0.0",
    });
  });
});
