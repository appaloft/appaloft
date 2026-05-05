import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  BindResourceDependencyCommand,
  type Command,
  type CommandBus,
  createExecutionContext,
  DeleteDependencyResourceCommand,
  type ExecutionContext,
  type ExecutionContextFactory,
  ImportPostgresDependencyResourceCommand,
  ListDependencyResourcesQuery,
  ListResourceDependencyBindingsQuery,
  ProvisionPostgresDependencyResourceCommand,
  type Query,
  type QueryBus,
  RotateResourceDependencyBindingSecretCommand,
  ShowDependencyResourceQuery,
  ShowResourceDependencyBindingQuery,
  UnbindResourceDependencyCommand,
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
      requestId: input.requestId ?? "req_orpc_dependency_resource_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

function createHarness() {
  const commands: Command<unknown>[] = [];
  const queries: Query<unknown>[] = [];
  const commandBus = {
    execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
      commands.push(command as Command<unknown>);
      if (command instanceof RotateResourceDependencyBindingSecretCommand) {
        return ok({
          id: "rbd_pg",
          rotatedAt: "2026-01-01T00:00:00.000Z",
          secretVersion: "rbsv_0001",
        } as T);
      }
      return ok({ id: "rsi_pg" } as T);
    },
  } as CommandBus;
  const queryBus = {
    execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
      queries.push(query as Query<unknown>);
      if (query instanceof ShowDependencyResourceQuery) {
        return ok({
          schemaVersion: "dependency-resources.show/v1",
          dependencyResource: {
            id: "rsi_pg",
            projectId: "prj_demo",
            environmentId: "env_demo",
            name: "External DB",
            slug: "external-db",
            kind: "postgres",
            sourceMode: "imported-external",
            providerKey: "external-postgres",
            providerManaged: false,
            lifecycleStatus: "ready",
            bindingReadiness: { status: "not-implemented" },
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          generatedAt: "2026-01-01T00:00:00.000Z",
        } as T);
      }
      if (query instanceof ListResourceDependencyBindingsQuery) {
        return ok({
          schemaVersion: "resources.dependency-bindings.list/v1",
          items: [],
          generatedAt: "2026-01-01T00:00:00.000Z",
        } as T);
      }
      if (query instanceof ShowResourceDependencyBindingQuery) {
        return ok({
          schemaVersion: "resources.dependency-bindings.show/v1",
          binding: {
            id: "rbd_pg",
            projectId: "prj_demo",
            environmentId: "env_demo",
            resourceId: "res_api",
            dependencyResourceId: "rsi_pg",
            dependencyResourceName: "External DB",
            dependencyResourceSlug: "external-db",
            kind: "postgres",
            sourceMode: "imported-external",
            providerKey: "external-postgres",
            providerManaged: false,
            lifecycleStatus: "ready",
            target: {
              targetName: "DATABASE_URL",
              scope: "runtime-only",
              injectionMode: "env",
              secretRef: "secretref_postgres",
            },
            connection: {
              host: "db.example.com",
              port: 5432,
              database: "app",
              username: "app",
              maskedConnection: "postgres://app:***@db.example.com:5432/app",
            },
            bindingReadiness: { status: "ready" },
            snapshotReadiness: {
              status: "ready",
            },
            status: "active",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          generatedAt: "2026-01-01T00:00:00.000Z",
        } as T);
      }
      return ok({
        schemaVersion: "dependency-resources.list/v1",
        items: [],
        generatedAt: "2026-01-01T00:00:00.000Z",
      } as T);
    },
  } as QueryBus;
  const app = mountAppaloftOrpcRoutes(new Elysia(), {
    commandBus,
    executionContextFactory: new TestExecutionContextFactory(),
    logger: new NoopLogger(),
    queryBus,
  });
  return { app, commands, queries };
}

describe("dependency resource HTTP routes", () => {
  test("[DEP-RES-PG-ENTRY-002] dispatches provision and import through HTTP", async () => {
    const { app, commands } = createHarness();

    const provisionResponse = await app.handle(
      new Request("http://localhost/api/dependency-resources/postgres/provision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: "prj_demo",
          environmentId: "env_demo",
          name: "Main DB",
        }),
      }),
    );
    const importResponse = await app.handle(
      new Request("http://localhost/api/dependency-resources/postgres/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: "prj_demo",
          environmentId: "env_demo",
          name: "External DB",
          connectionUrl: "postgres://user:secret@db.example.com:5432/app?sslmode=require",
        }),
      }),
    );

    expect(provisionResponse.status).toBe(201);
    expect(importResponse.status).toBe(201);
    expect(commands[0]).toBeInstanceOf(ProvisionPostgresDependencyResourceCommand);
    expect(commands[1]).toBeInstanceOf(ImportPostgresDependencyResourceCommand);
  });

  test("[DEP-RES-PG-ENTRY-002] dispatches list/show/delete through HTTP", async () => {
    const { app, commands, queries } = createHarness();

    const listResponse = await app.handle(
      new Request("http://localhost/api/dependency-resources?projectId=prj_demo"),
    );
    const showResponse = await app.handle(
      new Request("http://localhost/api/dependency-resources/rsi_pg"),
    );
    const deleteResponse = await app.handle(
      new Request("http://localhost/api/dependency-resources/rsi_pg", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dependencyResourceId: "rsi_pg" }),
      }),
    );

    expect(listResponse.status).toBe(200);
    expect(showResponse.status).toBe(200);
    expect(deleteResponse.status).toBe(200);
    expect(queries[0]).toBeInstanceOf(ListDependencyResourcesQuery);
    expect(queries[1]).toBeInstanceOf(ShowDependencyResourceQuery);
    expect(commands[0]).toBeInstanceOf(DeleteDependencyResourceCommand);
  });

  test("[DEP-BIND-PG-ENTRY-001] dispatches resource dependency binding routes through HTTP", async () => {
    const { app, commands, queries } = createHarness();

    const bindResponse = await app.handle(
      new Request("http://localhost/api/resources/res_api/dependency-bindings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resourceId: "res_api",
          dependencyResourceId: "rsi_pg",
          targetName: "DATABASE_URL",
        }),
      }),
    );
    const listResponse = await app.handle(
      new Request("http://localhost/api/resources/res_api/dependency-bindings"),
    );
    const showResponse = await app.handle(
      new Request("http://localhost/api/resources/res_api/dependency-bindings/rbd_pg"),
    );
    const unbindResponse = await app.handle(
      new Request("http://localhost/api/resources/res_api/dependency-bindings/rbd_pg", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resourceId: "res_api", bindingId: "rbd_pg" }),
      }),
    );
    const rotateResponse = await app.handle(
      new Request(
        "http://localhost/api/resources/res_api/dependency-bindings/rbd_pg/secret-rotations",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            resourceId: "res_api",
            bindingId: "rbd_pg",
            secretRef: "secret://dependency-binding/rbd_pg/current",
            confirmHistoricalSnapshotsRemainUnchanged: true,
          }),
        },
      ),
    );

    expect(bindResponse.status).toBe(201);
    expect(listResponse.status).toBe(200);
    expect(showResponse.status).toBe(200);
    expect(unbindResponse.status).toBe(200);
    expect(rotateResponse.status).toBe(200);
    expect(commands[0]).toBeInstanceOf(BindResourceDependencyCommand);
    expect(commands[1]).toBeInstanceOf(UnbindResourceDependencyCommand);
    expect(commands[2]).toBeInstanceOf(RotateResourceDependencyBindingSecretCommand);
    expect(queries[0]).toBeInstanceOf(ListResourceDependencyBindingsQuery);
    expect(queries[1]).toBeInstanceOf(ShowResourceDependencyBindingQuery);
  });
});
