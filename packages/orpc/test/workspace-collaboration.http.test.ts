import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  CreateWorkspaceCollaborationCommand,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  IssueWorkspaceCollaborationTerminalAccessCommand,
  ListWorkspaceCollaborationsQuery,
  type Query,
  type QueryBus,
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

class CollaborationContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      requestId: input.requestId ?? "req_collaboration_http",
      entrypoint: input.entrypoint,
      actor: input.actor,
      principal: input.principal,
      tenant: input.tenant,
    });
  }
}

describe("Workspace Collaboration HTTP routes", () => {
  test("[COLLAB-SURFACE-013] dispatches create, list and terminal access through oRPC", async () => {
    const commands: Command<unknown>[] = [];
    const queries: Query<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        commands.push(command as Command<unknown>);
        return ok(
          command instanceof IssueWorkspaceCollaborationTerminalAccessCommand
            ? ({
                access: "observe",
                transport: {
                  kind: "websocket",
                  path: "/api/terminal-sessions/term_builder/attach?access_token=cap_observer",
                },
              } as T)
            : ({ collaborationId: "wsc_issue_123", status: "active" } as T),
        );
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        queries.push(query as Query<unknown>);
        return ok({ items: [] } as T);
      },
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      queryBus,
      executionContextFactory: new CollaborationContextFactory(),
      logger: new NoopLogger(),
    });

    const created = await app.handle(
      new Request("http://localhost/api/workspace-collaborations", {
        method: "POST",
        headers: { authorization: "Bearer test", "content-type": "application/json" },
        body: JSON.stringify({
          name: "Issue 123",
          workspaceId: "sbx_builder",
          lanePurpose: "builder",
          laneLabel: "Builder",
        }),
      }),
    );
    const listed = await app.handle(
      new Request("http://localhost/api/workspace-collaborations", {
        headers: { authorization: "Bearer test" },
      }),
    );
    const terminal = await app.handle(
      new Request(
        "http://localhost/api/workspace-collaborations/wsc_issue_123/lanes/wln_builder/terminal-access",
        {
          method: "POST",
          headers: { authorization: "Bearer test", "content-type": "application/json" },
          body: JSON.stringify({
            sessionId: "term_builder",
            access: "observe",
          }),
        },
      ),
    );

    expect(created.status).toBe(201);
    expect(commands[0]).toBeInstanceOf(CreateWorkspaceCollaborationCommand);
    expect(listed.status).toBe(200);
    expect(queries[0]).toBeInstanceOf(ListWorkspaceCollaborationsQuery);
    expect(terminal.status).toBe(201);
    expect(commands[1]).toBeInstanceOf(IssueWorkspaceCollaborationTerminalAccessCommand);
    expect(commands[1]).toMatchObject({
      input: {
        collaborationId: "wsc_issue_123",
        laneId: "wln_builder",
        sessionId: "term_builder",
        access: "observe",
      },
    });
  });
});
