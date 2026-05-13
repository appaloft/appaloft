import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  ArchiveResourceRuntimeLogsCommand,
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListResourceRuntimeLogArchivesQuery,
  PruneResourceRuntimeLogArchivesCommand,
  type Query,
  type QueryBus,
  ShowResourceRuntimeLogArchiveQuery,
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
      requestId: input.requestId ?? "req_orpc_resource_runtime_log_archive_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

const archiveDetail = {
  archiveId: "rla_primary",
  resourceId: "res_web",
  deploymentId: "dep_primary",
  serverId: "srv_primary",
  serviceName: "web",
  runtimeKind: "docker-compose",
  capturedAt: "2026-01-01T00:05:00.000Z",
  lineCount: 1,
  retentionStatus: "retained" as const,
  reason: "delete safety evidence",
  lines: [
    {
      resourceId: "res_web",
      deploymentId: "dep_primary",
      serviceName: "web",
      runtimeKind: "docker-compose",
      stream: "stdout" as const,
      timestamp: "2026-01-01T00:04:00.000Z",
      message: "ready token=[redacted]",
      masked: true,
    },
  ],
};

describe("resource runtime log archive HTTP routes", () => {
  test("[RUNTIME-LOG-ARCHIVE-006] dispatches shared archive/list/show/prune messages", async () => {
    const capturedCommands: Command<unknown>[] = [];
    const capturedQueries: Query<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommands.push(command as Command<unknown>);
        if (command instanceof ArchiveResourceRuntimeLogsCommand) {
          return ok({
            schemaVersion: "resources.runtime-logs.archive/v1",
            archive: archiveDetail,
          } as T);
        }

        return ok({
          schemaVersion: "resources.runtime-log-archives.prune/v1",
          before: "2026-01-01T00:00:00.000Z",
          resourceId: "res_web",
          serviceName: "web",
          dryRun: false,
          matchedCount: 1,
          prunedCount: 1,
          affectedResourceCount: 1,
          prunedAt: "2026-01-01T00:10:00.000Z",
        } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQueries.push(query as Query<unknown>);
        if (query instanceof ListResourceRuntimeLogArchivesQuery) {
          const { lines: _lines, ...summary } = archiveDetail;
          return ok({
            schemaVersion: "resources.runtime-log-archives.list/v1",
            items: [summary],
            generatedAt: "2026-01-01T00:06:00.000Z",
          } as T);
        }

        return ok({
          schemaVersion: "resources.runtime-log-archives.show/v1",
          archive: archiveDetail,
        } as T);
      },
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const archiveResponse = await app.handle(
      new Request("http://localhost/api/resources/res_web/runtime-log-archives", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resourceId: "res_web",
          deploymentId: "dep_primary",
          serviceName: "web",
          tailLines: 20,
          reason: "delete safety evidence",
        }),
      }),
    );
    const listResponse = await app.handle(
      new Request("http://localhost/api/resources/runtime-log-archives?resourceId=res_web"),
    );
    const showResponse = await app.handle(
      new Request("http://localhost/api/resources/runtime-log-archives/rla_primary"),
    );
    const pruneResponse = await app.handle(
      new Request("http://localhost/api/resources/runtime-log-archives/prune", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          before: "2026-01-01T00:00:00.000Z",
          resourceId: "res_web",
          serviceName: "web",
          dryRun: false,
        }),
      }),
    );

    expect(archiveResponse.status).toBe(201);
    expect(await archiveResponse.json()).toEqual({
      schemaVersion: "resources.runtime-logs.archive/v1",
      archive: archiveDetail,
    });
    expect(listResponse.status).toBe(200);
    expect(showResponse.status).toBe(200);
    expect(pruneResponse.status).toBe(200);
    expect(capturedCommands[0]).toBeInstanceOf(ArchiveResourceRuntimeLogsCommand);
    expect(capturedCommands[0]).toMatchObject({
      resourceId: "res_web",
      deploymentId: "dep_primary",
      serviceName: "web",
      tailLines: 20,
      reason: "delete safety evidence",
    });
    expect(capturedQueries[0]).toBeInstanceOf(ListResourceRuntimeLogArchivesQuery);
    expect(capturedQueries[0]).toMatchObject({ resourceId: "res_web" });
    expect(capturedQueries[1]).toBeInstanceOf(ShowResourceRuntimeLogArchiveQuery);
    expect(capturedQueries[1]).toMatchObject({ archiveId: "rla_primary" });
    expect(capturedCommands[1]).toBeInstanceOf(PruneResourceRuntimeLogArchivesCommand);
    expect(capturedCommands[1]).toMatchObject({
      before: "2026-01-01T00:00:00.000Z",
      resourceId: "res_web",
      serviceName: "web",
      dryRun: false,
    });
  });
});
