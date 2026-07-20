import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  CreateSandboxCommand,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListSandboxesQuery,
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

class SandboxContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      requestId: input.requestId ?? "req_sandbox_http",
      entrypoint: input.entrypoint,
      actor: input.actor,
      principal: input.principal,
      tenant: input.tenant,
    });
  }
}

describe("execution sandbox HTTP routes", () => {
  test("[SBX-HTTP-001] exposes create and list through the generated oRPC surface", async () => {
    let command: Command<unknown> | undefined;
    let query: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, value: Command<T>): Promise<Result<T>> => {
        command = value as Command<unknown>;
        return ok({ sandboxId: "sbx_http", status: "requested" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, value: Query<T>): Promise<Result<T>> => {
        query = value as Query<unknown>;
        return ok({ items: [] } as T);
      },
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      queryBus,
      executionContextFactory: new SandboxContextFactory(),
      logger: new NoopLogger(),
    });

    const created = await app.handle(
      new Request("http://localhost/api/sandboxes", {
        method: "POST",
        headers: { authorization: "Bearer test", "content-type": "application/json" },
        body: JSON.stringify({
          source: { kind: "image", image: "python@sha256:abc123" },
          requestedIsolation: "gvisor",
          limits: {
            cpuMillis: 1_000,
            memoryBytes: 536_870_912,
            diskBytes: 2_147_483_648,
            maxProcesses: 32,
          },
          networkPolicy: { mode: "deny", rules: [] },
        }),
      }),
    );
    const listed = await app.handle(
      new Request("http://localhost/api/sandboxes?limit=20", {
        headers: { authorization: "Bearer test" },
      }),
    );

    expect(created.status).toBe(202);
    expect(await created.json()).toMatchObject({ sandboxId: "sbx_http" });
    expect(command).toBeInstanceOf(CreateSandboxCommand);
    expect(listed.status).toBe(200);
    expect(query).toBeInstanceOf(ListSandboxesQuery);
    expect(query).toMatchObject({ input: { limit: 20 } });
  });
});
