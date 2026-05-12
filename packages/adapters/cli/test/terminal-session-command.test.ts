import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  CloseTerminalSessionCommand,
  type CommandBus,
  createExecutionContext,
  type ExecutionContextFactory,
  ExpireTerminalSessionsCommand,
  ListTerminalSessionsQuery,
  type QueryBus,
  ShowTerminalSessionQuery,
} from "@appaloft/application";
import { ok } from "@appaloft/core";

function executionContextFactory(requestId: string): ExecutionContextFactory {
  return {
    create: (input) =>
      createExecutionContext({
        ...input,
        requestId,
      }),
  };
}

function createHarness() {
  const commands: AppCommand<unknown>[] = [];
  const queries: AppQuery<unknown>[] = [];
  const commandBus = {
    execute: async <T>(_context: unknown, command: AppCommand<T>) => {
      commands.push(command as AppCommand<unknown>);
      if (command instanceof ExpireTerminalSessionsCommand) {
        return ok({
          expiredCount: 1,
          sessionIds: ["term_old"],
        } as T);
      }

      return ok({
        sessionId: "term_test",
        closed: true,
        status: "closed",
      } as T);
    },
  } as unknown as CommandBus;
  const queryBus = {
    execute: async <T>(_context: unknown, query: AppQuery<T>) => {
      queries.push(query as AppQuery<unknown>);
      if (query instanceof ShowTerminalSessionQuery) {
        return ok({
          schemaVersion: "terminal-sessions.show/v1",
          item: terminalSessionSummary(),
        } as T);
      }

      return ok({
        schemaVersion: "terminal-sessions.list/v1",
        items: [terminalSessionSummary()],
        generatedAt: "2026-01-01T00:00:00.000Z",
      } as T);
    },
  } as unknown as QueryBus;

  return { commandBus, commands, queries, queryBus };
}

function terminalSessionSummary() {
  return {
    sessionId: "term_test",
    scope: "resource" as const,
    serverId: "srv_demo",
    resourceId: "res_web",
    deploymentId: "dep_new",
    transport: {
      kind: "websocket" as const,
      path: "/api/terminal-sessions/term_test/attach",
    },
    providerKey: "local-shell",
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "active" as const,
  };
}

async function withMutedStdout(callback: () => Promise<void>) {
  const writeStdout = process.stdout.write;
  try {
    process.stdout.write = (() => true) as typeof process.stdout.write;
    await callback();
  } finally {
    process.stdout.write = writeStdout;
  }
}

describe("CLI terminal session lifecycle commands", () => {
  test("[TERM-SESSION-ENTRY-007] dispatches list/show/close/expire through shared messages", async () => {
    const { createCliProgram } = await import("../src");
    const harness = createHarness();
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: harness.commandBus,
      queryBus: harness.queryBus,
      executionContextFactory: executionContextFactory("req_cli_terminal_session_lifecycle_test"),
    });

    await withMutedStdout(async () => {
      await program.parseAsync([
        "node",
        "appaloft",
        "terminal-session",
        "list",
        "--scope",
        "resource",
        "--resource-id",
        "res_web",
        "--deployment-id",
        "dep_new",
        "--limit",
        "5",
      ]);
      await program.parseAsync(["node", "appaloft", "terminal-session", "show", "term_test"]);
      await program.parseAsync(["node", "appaloft", "terminal-session", "close", "term_test"]);
      await program.parseAsync([
        "node",
        "appaloft",
        "terminal-session",
        "expire",
        "--older-than",
        "2026-01-01T00:00:00.000Z",
        "--limit",
        "10",
      ]);
    });

    expect(harness.queries).toHaveLength(2);
    expect(harness.queries[0]).toBeInstanceOf(ListTerminalSessionsQuery);
    expect(harness.queries[0]).toMatchObject({
      scope: "resource",
      resourceId: "res_web",
      deploymentId: "dep_new",
      limit: 5,
    });
    expect(harness.queries[1]).toBeInstanceOf(ShowTerminalSessionQuery);
    expect(harness.queries[1]).toMatchObject({
      sessionId: "term_test",
    });
    expect(harness.commands).toHaveLength(2);
    expect(harness.commands[0]).toBeInstanceOf(CloseTerminalSessionCommand);
    expect(harness.commands[0]).toMatchObject({
      sessionId: "term_test",
    });
    expect(harness.commands[1]).toBeInstanceOf(ExpireTerminalSessionsCommand);
    expect(harness.commands[1]).toMatchObject({
      olderThan: "2026-01-01T00:00:00.000Z",
      limit: 10,
    });
  });
});
