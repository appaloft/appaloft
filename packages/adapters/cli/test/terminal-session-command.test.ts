import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  CloseTerminalSessionCommand,
  type CloseTerminalSessionResponse,
  type CommandBus,
  createExecutionContext,
  type ExecutionContextFactory,
  ExpireTerminalSessionsCommand,
  type ExpireTerminalSessionsResponse,
  ListTerminalSessionsQuery,
  OpenTerminalSessionCommand,
  type QueryBus,
  ShowTerminalSessionQuery,
  type TerminalSession,
  type TerminalSessionDescriptor,
  type TerminalSessionFrame,
  type TerminalSessionGateway,
  type TerminalSessionSummary,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";

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

class FakeTerminalSession implements TerminalSession {
  readonly writes: string[] = [];
  readonly resizes: Array<{ rows: number; cols: number }> = [];
  closed = false;

  constructor(private readonly frames: TerminalSessionFrame[]) {}

  async write(data: string): Promise<void> {
    this.writes.push(data);
  }

  async resize(input: { rows: number; cols: number }): Promise<void> {
    this.resizes.push(input);
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<TerminalSessionFrame> {
    for (const frame of this.frames) {
      yield frame;
    }
  }
}

class FakeTerminalSessionGateway implements TerminalSessionGateway {
  readonly session = new FakeTerminalSession([
    { kind: "ready", sessionId: "term_test" },
    { kind: "output", stream: "stdout", data: "hello from shell\n" },
    { kind: "closed", reason: "source-ended", exitCode: 0 },
  ]);
  readonly attached: string[] = [];

  async open(): Promise<Result<TerminalSessionDescriptor>> {
    return err(domainError.terminalSessionNotConfigured("not used"));
  }

  attach(sessionId: string): Result<TerminalSession> {
    this.attached.push(sessionId);
    return ok(this.session);
  }

  list(): TerminalSessionSummary[] {
    return [];
  }

  show(): Result<TerminalSessionSummary> {
    return err(domainError.terminalSessionNotConfigured("not used"));
  }

  async close(): Promise<Result<CloseTerminalSessionResponse>> {
    return err(domainError.terminalSessionNotConfigured("not used"));
  }

  async expire(): Promise<Result<ExpireTerminalSessionsResponse>> {
    return err(domainError.terminalSessionNotConfigured("not used"));
  }
}

function fakeTerminalIO() {
  const rawMode: boolean[] = [];
  const stdout: string[] = [];
  const stderr: string[] = [];
  const listeners: Array<(chunk: string | Uint8Array) => void> = [];

  return {
    rawMode,
    stdout,
    stderr,
    listeners,
    io: {
      stdin: {
        isTTY: true,
        setRawMode(enabled: boolean) {
          rawMode.push(enabled);
        },
        resume() {},
        pause() {},
        on(_event: "data", listener: (chunk: string | Uint8Array) => void) {
          listeners.push(listener);
        },
        off(_event: "data", listener: (chunk: string | Uint8Array) => void) {
          const index = listeners.indexOf(listener);
          if (index >= 0) {
            listeners.splice(index, 1);
          }
        },
      },
      stdout: {
        write(data: string | Uint8Array) {
          stdout.push(typeof data === "string" ? data : new TextDecoder().decode(data));
          return true;
        },
      },
      stderr: {
        write(data: string | Uint8Array) {
          stderr.push(typeof data === "string" ? data : new TextDecoder().decode(data));
          return true;
        },
      },
    },
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

  test("[TERM-SESSION-ENTRY-004] attaches server terminal sessions when requested", async () => {
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok(terminalSessionSummary() as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const gateway = new FakeTerminalSessionGateway();
    const terminal = fakeTerminalIO();
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory: executionContextFactory("req_cli_terminal_attach_test"),
      terminalSessionGateway: gateway,
      terminalIO: terminal.io,
    });

    await program.parseAsync([
      "node",
      "appaloft",
      "server",
      "terminal",
      "srv_demo",
      "--attach",
      "--rows",
      "40",
      "--cols",
      "120",
    ]);

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(OpenTerminalSessionCommand);
    expect(commands[0]).toMatchObject({
      scope: {
        kind: "server",
        serverId: "srv_demo",
      },
      initialRows: 40,
      initialCols: 120,
    });
    expect(gateway.attached).toEqual(["term_test"]);
    expect(gateway.session.resizes).toEqual([{ rows: 40, cols: 120 }]);
    expect(terminal.stdout.join("")).toBe("hello from shell\n");
    expect(terminal.stderr).toEqual([]);
    expect(terminal.rawMode).toEqual([true, false]);
    expect(terminal.listeners).toHaveLength(0);
  });

  test("[TERM-SESSION-ENTRY-005] attaches resource terminal sessions when requested", async () => {
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok(terminalSessionSummary() as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const gateway = new FakeTerminalSessionGateway();
    const terminal = fakeTerminalIO();
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory: executionContextFactory("req_cli_resource_terminal_attach_test"),
      terminalSessionGateway: gateway,
      terminalIO: terminal.io,
    });

    await program.parseAsync([
      "node",
      "appaloft",
      "resource",
      "terminal",
      "res_web",
      "--deployment",
      "dep_new",
      "--directory",
      "src",
      "--attach",
    ]);

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(OpenTerminalSessionCommand);
    expect(commands[0]).toMatchObject({
      scope: {
        kind: "resource",
        resourceId: "res_web",
        deploymentId: "dep_new",
      },
      relativeDirectory: "src",
      initialRows: 24,
      initialCols: 80,
    });
    expect(gateway.attached).toEqual(["term_test"]);
    expect(gateway.session.resizes).toEqual([{ rows: 24, cols: 80 }]);
    expect(terminal.stdout.join("")).toBe("hello from shell\n");
    expect(terminal.rawMode).toEqual([true, false]);
    expect(terminal.listeners).toHaveLength(0);
  });
});
