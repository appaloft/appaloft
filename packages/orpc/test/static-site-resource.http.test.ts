import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  CreateResourceCommand,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
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

class TestExecutionContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      requestId: input.requestId ?? "req_orpc_static_resource_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

describe("static site resource HTTP route", () => {
  test("[RES-CREATE-ENTRY-001] dispatches static site resources.create through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "res_static" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/resources", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          projectId: "prj_demo",
          environmentId: "env_demo",
          destinationId: "dst_demo",
          name: "Docs Site",
          kind: "static-site",
          source: {
            kind: "git-public",
            locator: "https://github.com/acme/docs-site.git",
            baseDirectory: "/site",
          },
          runtimeProfile: {
            strategy: "static",
            buildCommand: "pnpm build",
            publishDirectory: "/dist",
          },
          networkProfile: {
            internalPort: 80,
            upstreamProtocol: "http",
            exposureMode: "reverse-proxy",
          },
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "res_static" });
    expect(capturedCommand).toBeInstanceOf(CreateResourceCommand);
    expect((capturedCommand as CreateResourceCommand).runtimeProfile).toEqual(
      expect.objectContaining({
        strategy: "static",
        buildCommand: "pnpm build",
        publishDirectory: "/dist",
      }),
    );
  });
});
