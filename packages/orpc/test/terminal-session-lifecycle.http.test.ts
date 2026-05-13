import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  CloseTerminalSessionCommand,
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  ExpireTerminalSessionsCommand,
  ListTerminalSessionsQuery,
  type Query,
  type QueryBus,
  ShowTerminalSessionQuery,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";
import { Elysia } from "elysia";

import { mountAppaloftOrpcRoutes } from "../src";

class NoopLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class TestExecutionContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      requestId: input.requestId ?? "req_orpc_terminal_lifecycle_test",
      entrypoint: input.entrypoint,
      ...(input.locale ? { locale: input.locale } : {}),
      ...(input.actor ? { actor: input.actor } : {}),
    });
  }
}

function terminalSummary() {
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
    workingDirectory: "/var/lib/appaloft/runtime/local-deployments/dep_new/source",
    createdAt: "2026-04-16T00:00:00.000Z",
    status: "active" as const,
  };
}

describe("terminal session lifecycle HTTP routes", () => {
  test("[TERM-SESSION-ENTRY-008] lists active terminal sessions through HTTP query dispatch", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          schemaVersion: "terminal-sessions.list/v1",
          items: [terminalSummary()],
        } as T);
      },
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request(
        "http://localhost/api/terminal-sessions?scope=resource&resourceId=res_web&deploymentId=dep_new&limit=5",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      schemaVersion: "terminal-sessions.list/v1",
      items: [
        {
          sessionId: "term_test",
          status: "active",
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain("PRIVATE KEY");
    expect(JSON.stringify(body)).not.toContain("command");
    expect(capturedQuery).toBeInstanceOf(ListTerminalSessionsQuery);
    expect(capturedQuery).toMatchObject({
      scope: "resource",
      resourceId: "res_web",
      deploymentId: "dep_new",
      limit: 5,
    });
  });

  test("[TERM-SESSION-ENTRY-008] shows one active terminal session through HTTP query dispatch", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          schemaVersion: "terminal-sessions.show/v1",
          item: terminalSummary(),
        } as T);
      },
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/terminal-sessions/term_test"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "terminal-sessions.show/v1",
      item: {
        sessionId: "term_test",
      },
    });
    expect(capturedQuery).toBeInstanceOf(ShowTerminalSessionQuery);
    expect(capturedQuery).toMatchObject({
      sessionId: "term_test",
    });
  });

  test("[TERM-SESSION-ENTRY-008] closes and expires terminal sessions through HTTP command dispatch", async () => {
    const capturedCommands: Command<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommands.push(command as Command<unknown>);
        if (command instanceof CloseTerminalSessionCommand) {
          return ok({
            sessionId: command.sessionId,
            closed: true,
            status: "closed",
          } as T);
        }
        return ok({
          expiredCount: 1,
          sessionIds: ["term_old"],
        } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(): Promise<Result<T>> => ok({} as T),
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const closeResponse = await app.handle(
      new Request("http://localhost/api/terminal-sessions/term_test/close", { method: "POST" }),
    );
    const expireResponse = await app.handle(
      new Request("http://localhost/api/terminal-sessions/expire", {
        method: "POST",
        body: JSON.stringify({ olderThan: "2026-04-16T12:00:00.000Z", limit: 10 }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(closeResponse.status).toBe(200);
    expect(await closeResponse.json()).toEqual({
      sessionId: "term_test",
      closed: true,
      status: "closed",
    });
    expect(expireResponse.status).toBe(200);
    expect(await expireResponse.json()).toEqual({
      expiredCount: 1,
      sessionIds: ["term_old"],
    });
    expect(capturedCommands[0]).toBeInstanceOf(CloseTerminalSessionCommand);
    expect(capturedCommands[0]).toMatchObject({ sessionId: "term_test" });
    expect(capturedCommands[1]).toBeInstanceOf(ExpireTerminalSessionsCommand);
    expect(capturedCommands[1]).toMatchObject({
      olderThan: "2026-04-16T12:00:00.000Z",
      limit: 10,
    });
  });
});
