import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  AcceptBlueprintInstallCommand,
  type AppLogger,
  type Command,
  type CommandBus,
  CreateBlueprintInstallPlanQuery,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListBlueprintsQuery,
  type Query,
  type QueryBus,
  ShowBlueprintQuery,
} from "@appaloft/application";
import { err, ok, type Result } from "@appaloft/core";
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
      requestId: input.requestId ?? "req_orpc_blueprint_catalog_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
      principal: input.principal,
      tenant: input.tenant,
    });
  }
}

function createApp(queryBus: QueryBus, commandBus?: CommandBus) {
  const fallbackCommandBus = {
    execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
      ok({} as T),
  } as CommandBus;

  return mountAppaloftOrpcRoutes(new Elysia(), {
    commandBus: commandBus ?? fallbackCommandBus,
    executionContextFactory: new TestExecutionContextFactory(),
    logger: new NoopLogger(),
    queryBus,
  });
}

describe("blueprint catalog HTTP routes", () => {
  test("[BP-CATALOG-API-001] mounts Blueprint catalog REST paths through oRPC", async () => {
    const capturedMessages: Array<Query<unknown> | Command<unknown>> = [];
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedMessages.push(query as Query<unknown>);
        if (query instanceof ListBlueprintsQuery) {
          return ok({
            items: [
              {
                slug: "pocketbase",
                name: "PocketBase",
                description: "PocketBase Blueprint",
              },
            ],
          } as T);
        }
        if (query instanceof ShowBlueprintQuery) {
          return ok({
            entry: {
              slug: query.slug,
              name: "PocketBase",
              description: "PocketBase Blueprint",
            },
            manifest: {
              slug: query.slug,
              name: "PocketBase",
              version: "1.0.0",
            },
          } as T);
        }
        if (query instanceof CreateBlueprintInstallPlanQuery) {
          return ok({
            entry: {
              slug: query.slug,
              name: "PocketBase",
              description: "PocketBase Blueprint",
            },
            plan: {
              manifestSlug: query.slug,
              issues: [],
              resources: [],
            },
            applicationBundle: {
              resources: [],
            },
          } as T);
        }
        throw new Error("Unexpected query");
      },
    } as QueryBus;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedMessages.push(command as Command<unknown>);
        if (command instanceof AcceptBlueprintInstallCommand) {
          return ok({
            schemaVersion: "appaloft.blueprint.install-result/v1",
            slug: command.slug,
          } as T);
        }
        throw new Error("Unexpected command");
      },
    } as CommandBus;
    const app = createApp(queryBus, commandBus);

    const listResponse = await app.handle(new Request("http://localhost/api/blueprints"));
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toMatchObject({
      items: [{ slug: "pocketbase" }],
    });

    const showResponse = await app.handle(
      new Request("http://localhost/api/blueprints/pocketbase"),
    );
    expect(showResponse.status).toBe(200);
    expect(await showResponse.json()).toMatchObject({
      entry: { slug: "pocketbase" },
      manifest: { slug: "pocketbase" },
    });

    const planResponse = await app.handle(
      new Request("http://localhost/api/blueprints/pocketbase/install-plan", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          target: {
            projectName: "Smoke",
          },
        }),
      }),
    );
    expect(planResponse.status).toBe(200);
    expect(await planResponse.json()).toMatchObject({
      entry: { slug: "pocketbase" },
      plan: { manifestSlug: "pocketbase" },
    });
    const installResponse = await app.handle(
      new Request("http://localhost/api/blueprints/pocketbase/install", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          target: {
            projectName: "Smoke",
          },
          idempotencyKey: "install:pocketbase:smoke",
          acknowledgements: ["accepts-blueprint-application-bundle"],
        }),
      }),
    );
    expect(installResponse.status).toBe(202);
    expect(await installResponse.json()).toMatchObject({
      schemaVersion: "appaloft.blueprint.install-result/v1",
      slug: "pocketbase",
    });
    expect(capturedMessages).toEqual([
      expect.any(ListBlueprintsQuery),
      expect.any(ShowBlueprintQuery),
      expect.any(CreateBlueprintInstallPlanQuery),
      expect.any(AcceptBlueprintInstallCommand),
    ]);
  });

  test("[BP-CATALOG-API-002] maps extension user errors to HTTP 400 without requiring public code enumeration", async () => {
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        if (command instanceof AcceptBlueprintInstallCommand) {
          return err({
            code: "user_provided_secret_missing",
            category: "user",
            message: "User-provided secret is required.",
            retryable: false,
            details: {
              componentId: "pocketbase",
              key: "POCKETBASE_ADMIN_PASSWORD",
            },
          });
        }
        throw new Error("Unexpected command");
      },
    } as CommandBus;
    const app = createApp(queryBus, commandBus);

    const response = await app.handle(
      new Request("http://localhost/api/blueprints/pocketbase/install", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          target: {
            projectName: "Smoke",
          },
          idempotencyKey: "install:pocketbase:missing-secret",
          acknowledgements: ["accepts-blueprint-application-bundle"],
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "user_provided_secret_missing",
        category: "user",
        message: "User-provided secret is required.",
        retryable: false,
        details: {
          componentId: "pocketbase",
          key: "POCKETBASE_ADMIN_PASSWORD",
        },
      },
    });
  });
});
