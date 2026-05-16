import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  DeleteSourceLinkCommand,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListSourceLinksQuery,
  type Query,
  type QueryBus,
  RelinkSourceLinkCommand,
  ShowSourceLinkQuery,
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
      requestId: input.requestId ?? "req_orpc_source_link_relink_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

describe("source link relink HTTP route", () => {
  test("[SOURCE-LINK-STATE-021][SOURCE-LINK-STATE-022] dispatches source link list/show queries through HTTP", async () => {
    const capturedQueries: Query<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok(null as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQueries.push(query as Query<unknown>);
        if (query.constructor.name === "ListSourceLinksQuery") {
          return ok({ schemaVersion: "source-links.list/v1", items: [] } as T);
        }

        return ok({
          schemaVersion: "source-links.show/v1",
          sourceLink: {
            sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
            projectId: "prj_console",
            environmentId: "env_prod",
            resourceId: "res_www",
            updatedAt: "2026-05-16T00:00:00.000Z",
          },
        } as T);
      },
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const listResponse = await app.handle(
      new Request("http://localhost/api/source-links?projectId=prj_console&limit=10"),
    );
    const showResponse = await app.handle(
      new Request("http://localhost/api/source-links/source-fingerprint%3Av1%3Abranch%253Amain"),
    );

    expect(listResponse.status).toBe(200);
    expect(showResponse.status).toBe(200);
    expect(capturedQueries[0]).toBeInstanceOf(ListSourceLinksQuery);
    expect(capturedQueries[0]).toMatchObject({ projectId: "prj_console", limit: 10 });
    expect(capturedQueries[1]).toBeInstanceOf(ShowSourceLinkQuery);
    expect(capturedQueries[1]).toMatchObject({
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
    });
  });

  test("[SOURCE-LINK-STATE-008] dispatches RelinkSourceLinkCommand through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
          projectId: "prj_console",
          environmentId: "env_prod",
          resourceId: "res_www",
          serverId: "srv_prod",
          destinationId: "dst_prod",
        } as T);
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
      new Request("http://localhost/api/source-links/relink", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
          projectId: "prj_console",
          environmentId: "env_prod",
          resourceId: "res_www",
          serverId: "srv_prod",
          destinationId: "dst_prod",
          expectedCurrentProjectId: "prj_old",
          expectedCurrentEnvironmentId: "env_old",
          expectedCurrentResourceId: "res_old",
          reason: "bind GitHub Actions production deployment to console resource",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      projectId: "prj_console",
      environmentId: "env_prod",
      resourceId: "res_www",
      serverId: "srv_prod",
      destinationId: "dst_prod",
    });
    expect(capturedCommand).toBeInstanceOf(RelinkSourceLinkCommand);
    expect(capturedCommand).toMatchObject({
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      projectId: "prj_console",
      environmentId: "env_prod",
      resourceId: "res_www",
      serverId: "srv_prod",
      destinationId: "dst_prod",
      expectedCurrentProjectId: "prj_old",
      expectedCurrentEnvironmentId: "env_old",
      expectedCurrentResourceId: "res_old",
      reason: "bind GitHub Actions production deployment to console resource",
    });
  });

  test("[SOURCE-LINK-STATE-023] dispatches DeleteSourceLinkCommand through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
          deleted: true,
        } as T);
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
      new Request("http://localhost/api/source-links/source-fingerprint%3Av1%3Abranch%253Amain", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
          reason: "reset stale link",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      deleted: true,
    });
    expect(capturedCommand).toBeInstanceOf(DeleteSourceLinkCommand);
    expect(capturedCommand).toMatchObject({
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      reason: "reset stale link",
    });
  });
});
