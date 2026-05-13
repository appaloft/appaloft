import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  CheckServerDeleteSafetyQuery,
  type Command,
  type CommandBus,
  ConfigureServerEdgeProxyCommand,
  createExecutionContext,
  DeactivateServerCommand,
  DeleteServerCommand,
  type ExecutionContext,
  type ExecutionContextFactory,
  InspectServerCapacityQuery,
  PruneServerCapacityCommand,
  type Query,
  type QueryBus,
  RenameServerCommand,
  ShowServerQuery,
} from "@appaloft/application";
import { type ServerDetail } from "@appaloft/contracts";
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
      requestId: input.requestId ?? "req_orpc_server_show_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

function serverDetail(): ServerDetail {
  return {
    schemaVersion: "servers.show/v1",
    server: {
      id: "srv_primary",
      name: "Primary",
      host: "203.0.113.10",
      port: 22,
      providerKey: "generic-ssh",
      targetKind: "single-server",
      lifecycleStatus: "active",
      edgeProxy: {
        kind: "traefik",
        status: "ready",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    rollups: {
      resources: {
        total: 1,
        deployedResourceIds: ["res_web"],
      },
      deployments: {
        total: 1,
        statusCounts: [{ status: "succeeded", count: 1 }],
        latestDeploymentId: "dep_latest",
        latestDeploymentStatus: "succeeded",
      },
      domains: {
        total: 1,
        statusCounts: [{ status: "ready", count: 1 }],
        latestDomainBindingId: "dom_latest",
        latestDomainBindingStatus: "ready",
      },
    },
    generatedAt: "2026-01-01T00:00:10.000Z",
  };
}

describe("server show HTTP route", () => {
  test("[SRV-LIFE-ENTRY-002] dispatches ShowServerQuery through HTTP", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok(serverDetail() as T);
      },
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/servers/srv_primary?includeRollups=true", {
        method: "GET",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "servers.show/v1",
      server: {
        id: "srv_primary",
      },
      rollups: {
        resources: {
          total: 1,
        },
      },
    });
    expect(capturedQuery).toBeInstanceOf(ShowServerQuery);
    expect(capturedQuery).toMatchObject({
      serverId: "srv_primary",
      includeRollups: true,
    });
  });

  test("[TS-SDK-OPENAPI-002][SRV-CAPACITY-ENTRY-001] dispatches InspectServerCapacityQuery through HTTP", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          schemaVersion: "servers.capacity.inspect/v1",
          server: {
            id: "srv_primary",
            name: "Primary",
            host: "203.0.113.10",
            port: 22,
            providerKey: "generic-ssh",
            targetKind: "single-server",
          },
          inspectedAt: "2026-01-01T00:00:10.000Z",
          disk: [
            {
              path: "/",
              mount: "/",
              size: 1000,
              used: 400,
              available: 600,
              usePercent: 40,
            },
          ],
          inodes: [
            {
              path: "/",
              mount: "/",
              used: 20,
              free: 80,
              usePercent: 20,
            },
          ],
          docker: {
            imagesSize: 10,
            reclaimableImagesSize: 2,
            buildCacheSize: 20,
            reclaimableBuildCacheSize: 5,
            containersSize: 3,
            volumesSize: 4,
          },
          memory: {
            total: 100,
            available: 60,
            used: 40,
            usePercent: 40,
          },
          cpu: {
            logicalCores: 4,
            loadAverage1m: 0.2,
            loadAverage5m: 0.3,
            loadAverage15m: 0.4,
          },
          appaloftRuntime: {
            runtimeRoot: {
              path: "/var/lib/appaloft/runtime",
              size: 30,
              detectable: true,
            },
            stateRoot: {
              path: "/var/lib/appaloft/runtime/state",
              size: 10,
              detectable: true,
            },
            sourceWorkspace: {
              path: "/var/lib/appaloft/runtime/sources",
              size: 15,
              detectable: true,
            },
          },
          safeReclaimableEstimate: {
            stoppedContainersSize: 3,
            danglingImagesSize: 2,
            oldBuildCacheSize: 5,
            oldPreviewWorkspaceCandidatesSize: 1,
            total: 11,
          },
          warnings: [],
          partial: false,
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
      new Request("http://localhost/api/servers/srv_primary/capacity", {
        method: "GET",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "servers.capacity.inspect/v1",
      server: {
        id: "srv_primary",
      },
      safeReclaimableEstimate: {
        total: 11,
      },
    });
    expect(capturedQuery).toBeInstanceOf(InspectServerCapacityQuery);
    expect(capturedQuery).toMatchObject({
      serverId: "srv_primary",
    });
  });

  test("[RT-CAP-PRUNE-005] dispatches PruneServerCapacityCommand through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          schemaVersion: "servers.capacity.prune/v1",
          server: {
            id: "srv_primary",
            name: "Primary",
            host: "203.0.113.10",
            port: 22,
            providerKey: "generic-ssh",
            targetKind: "single-server",
          },
          before: "2026-01-01T00:05:00.000Z",
          categories: ["stopped-containers"],
          dryRun: false,
          prunedAt: "2026-01-01T00:10:00.000Z",
          summary: {
            inspectedCount: 1,
            matchedCount: 0,
            prunedCount: 1,
            skippedCount: 0,
            excludedCount: 0,
            reclaimedBytes: 1024,
          },
          candidates: [
            {
              id: "ctr_old",
              category: "stopped-containers",
              target: "app_old",
              updatedAt: "2026-01-01T00:00:00.000Z",
              size: 1024,
              action: "pruned",
            },
          ],
          warnings: [],
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
      new Request("http://localhost/api/servers/srv_primary/capacity/prune", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serverId: "srv_primary",
          before: "2026-01-01T00:05:00.000Z",
          categories: ["stopped-containers"],
          dryRun: false,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "servers.capacity.prune/v1",
      server: {
        id: "srv_primary",
      },
      dryRun: false,
      summary: {
        prunedCount: 1,
      },
    });
    expect(capturedCommand).toBeInstanceOf(PruneServerCapacityCommand);
    expect(capturedCommand).toMatchObject({
      input: {
        serverId: "srv_primary",
        before: "2026-01-01T00:05:00.000Z",
        categories: ["stopped-containers"],
        dryRun: false,
      },
    });
  });

  test("[SRV-LIFE-ENTRY-006] dispatches DeactivateServerCommand through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "srv_primary" } as T);
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
      new Request("http://localhost/api/servers/srv_primary/deactivate", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "srv_primary" });
    expect(capturedCommand).toBeInstanceOf(DeactivateServerCommand);
    expect(capturedCommand).toMatchObject({
      serverId: "srv_primary",
    });
  });

  test("[SRV-LIFE-ENTRY-014] dispatches RenameServerCommand through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "srv_primary" } as T);
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
      new Request("http://localhost/api/servers/srv_primary/rename", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Primary SSH server",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "srv_primary" });
    expect(capturedCommand).toBeInstanceOf(RenameServerCommand);
    expect(capturedCommand).toMatchObject({
      serverId: "srv_primary",
      name: "Primary SSH server",
    });
  });

  test("[SRV-LIFE-ENTRY-018] dispatches ConfigureServerEdgeProxyCommand through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          id: "srv_primary",
          edgeProxy: {
            kind: "caddy",
            status: "pending",
          },
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
      new Request("http://localhost/api/servers/srv_primary/edge-proxy/configuration", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          proxyKind: "caddy",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "srv_primary",
      edgeProxy: {
        kind: "caddy",
        status: "pending",
      },
    });
    expect(capturedCommand).toBeInstanceOf(ConfigureServerEdgeProxyCommand);
    expect(capturedCommand).toMatchObject({
      serverId: "srv_primary",
      proxyKind: "caddy",
    });
  });

  test("[SRV-LIFE-ENTRY-008] dispatches CheckServerDeleteSafetyQuery through HTTP", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok({
          schemaVersion: "servers.delete-check/v1",
          serverId: "srv_primary",
          lifecycleStatus: "inactive",
          eligible: true,
          blockers: [],
          checkedAt: "2026-01-01T00:00:10.000Z",
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
      new Request("http://localhost/api/servers/srv_primary/delete-check", {
        method: "GET",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "servers.delete-check/v1",
      serverId: "srv_primary",
      eligible: true,
    });
    expect(capturedQuery).toBeInstanceOf(CheckServerDeleteSafetyQuery);
    expect(capturedQuery).toMatchObject({
      serverId: "srv_primary",
    });
  });

  test("[SRV-LIFE-ENTRY-011] dispatches DeleteServerCommand through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "srv_primary" } as T);
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
      new Request("http://localhost/api/servers/srv_primary", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          confirmation: {
            serverId: "srv_primary",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "srv_primary" });
    expect(capturedCommand).toBeInstanceOf(DeleteServerCommand);
    expect(capturedCommand).toMatchObject({
      serverId: "srv_primary",
      confirmation: {
        serverId: "srv_primary",
      },
    });
  });
});
