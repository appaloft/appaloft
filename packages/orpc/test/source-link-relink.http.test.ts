import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  type Query,
  type QueryBus,
  RelinkSourceLinkCommand,
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
});
