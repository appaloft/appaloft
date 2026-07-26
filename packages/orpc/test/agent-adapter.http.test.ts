import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  DisableAgentAdapterCommand,
  type ExecutionContext,
  type ExecutionContextFactory,
  InstallAgentAdapterCommand,
  ListAgentAdaptersQuery,
  type Query,
  type QueryBus,
  ShowAgentAdapterQuery,
  UninstallAgentAdapterCommand,
  ValidateAgentAdapterQuery,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";
import { Elysia } from "elysia";

import { mountAppaloftOrpcRoutes } from "../src";

const digest = `sha256:${"a".repeat(64)}`;
const installed = {
  installationId: "aai_example",
  definitionDigest: digest,
  adapterId: "opencode",
  adapterVersion: "1.0.0",
  displayName: "OpenCode",
  status: "enabled" as const,
  compatibility: {
    status: "compatible" as const,
    unavailableOptionalCapabilities: [],
  },
  installedAt: "2026-07-26T00:00:00.000Z",
};

class NoopLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class AgentAdapterContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      requestId: input.requestId ?? "req_agent_adapter_http",
      entrypoint: input.entrypoint,
      actor: input.actor,
      principal: input.principal,
      tenant: input.tenant,
    });
  }
}

describe("Agent Adapter HTTP routes", () => {
  test("[ADAPTER-SURFACE-011] dispatches lifecycle operations through shared schemas", async () => {
    const commands: Command<unknown>[] = [];
    const queries: Query<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        commands.push(command as Command<unknown>);
        if (command instanceof UninstallAgentAdapterCommand) {
          return ok({ installationId: "aai_example", uninstalled: true } as T);
        }
        return ok(
          command instanceof DisableAgentAdapterCommand
            ? { ...installed, status: "disabled", updatedAt: "2026-07-26T00:01:00.000Z" }
            : installed,
        ) as Result<T>;
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        queries.push(query as Query<unknown>);
        if (query instanceof ValidateAgentAdapterQuery) {
          return ok({
            manifest: { schemaVersion: "appaloft.agent-adapter/v1" },
            definitionDigest: digest,
            compatibility: installed.compatibility,
          } as T);
        }
        if (query instanceof ListAgentAdaptersQuery) return ok([installed] as T);
        return ok(installed as T);
      },
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      queryBus,
      executionContextFactory: new AgentAdapterContextFactory(),
      logger: new NoopLogger(),
    });
    const jsonHeaders = {
      authorization: "Bearer test",
      "content-type": "application/json",
    };

    const validated = await app.handle(
      new Request("http://localhost/api/agent-adapters/validate", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ manifest: { schemaVersion: "appaloft.agent-adapter/v1" } }),
      }),
    );
    const created = await app.handle(
      new Request("http://localhost/api/agent-adapters", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ manifest: { schemaVersion: "appaloft.agent-adapter/v1" } }),
      }),
    );
    const listed = await app.handle(
      new Request("http://localhost/api/agent-adapters?limit=20", {
        headers: { authorization: "Bearer test" },
      }),
    );
    const shown = await app.handle(
      new Request("http://localhost/api/agent-adapters/aai_example", {
        headers: { authorization: "Bearer test" },
      }),
    );
    const disabled = await app.handle(
      new Request("http://localhost/api/agent-adapters/aai_example/disable", {
        method: "POST",
        headers: jsonHeaders,
        body: "{}",
      }),
    );
    const uninstalled = await app.handle(
      new Request("http://localhost/api/agent-adapters/aai_example", {
        method: "DELETE",
        headers: { authorization: "Bearer test" },
      }),
    );

    expect([validated.status, created.status, listed.status, shown.status]).toEqual([
      200, 201, 200, 200,
    ]);
    expect(await listed.json()).toEqual([installed]);
    expect((queries[1] as ListAgentAdaptersQuery).input).toEqual({ limit: 20 });
    expect(queries[2]).toBeInstanceOf(ShowAgentAdapterQuery);
    expect(disabled.status).toBe(200);
    expect(await disabled.json()).toMatchObject({ status: "disabled" });
    expect(uninstalled.status).toBe(200);
    expect(await uninstalled.json()).toEqual({
      installationId: "aai_example",
      uninstalled: true,
    });
    expect(commands.map((command) => command.constructor)).toEqual([
      InstallAgentAdapterCommand,
      DisableAgentAdapterCommand,
      UninstallAgentAdapterCommand,
    ]);
  });
});
