import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  AttachResourceStorageCommand,
  CleanupStorageVolumeRuntimeCommand,
  type Command,
  type CommandBus,
  CreateStorageVolumeCommand,
  createExecutionContext,
  DeleteStorageVolumeCommand,
  DetachResourceStorageCommand,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListStorageVolumesQuery,
  type Query,
  type QueryBus,
  RenameStorageVolumeCommand,
  ShowStorageVolumeQuery,
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
      requestId: input.requestId ?? "req_orpc_storage_volume_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

function storageVolumeSummary() {
  return {
    id: "stv_api",
    projectId: "prj_demo",
    environmentId: "env_demo",
    name: "Data",
    slug: "data",
    kind: "named-volume" as const,
    lifecycleStatus: "active" as const,
    attachmentCount: 1,
    attachments: [
      {
        attachmentId: "rsa_api",
        resourceId: "res_web",
        resourceName: "Web",
        resourceSlug: "web",
        destinationPath: "/data",
        mountMode: "read-write" as const,
        attachedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function createApp(capture: (message: Command<unknown> | Query<unknown>) => void) {
  const commandBus = {
    execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
      capture(command as Command<unknown>);
      if (command instanceof CleanupStorageVolumeRuntimeCommand) {
        return ok({
          schemaVersion: "storage-volumes.cleanup-runtime/v1",
          storageVolume: { id: "stv_api", name: "Data", kind: "named-volume" },
          server: {
            id: "srv_primary",
            name: "Primary",
            host: "203.0.113.10",
            port: 22,
            providerKey: "generic-ssh",
            targetKind: "single-server",
          },
          before: "2026-01-01T00:05:00.000Z",
          dryRun: true,
          cleanedAt: "2026-01-01T00:10:00.000Z",
          summary: {
            inspectedCount: 1,
            matchedCount: 1,
            cleanedCount: 0,
            skippedCount: 0,
            blockedCount: 0,
          },
          candidates: [
            {
              id: "appaloft-stv_api",
              kind: "named-volume",
              target: "appaloft-stv_api",
              updatedAt: "2026-01-01T00:00:00.000Z",
              action: "matched",
            },
          ],
          warnings: [],
        } as T);
      }
      return ok({ id: "stv_api" } as T);
    },
  } as CommandBus;
  const queryBus = {
    execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
      capture(query as Query<unknown>);
      if (query instanceof ListStorageVolumesQuery) {
        return ok({
          schemaVersion: "storage-volumes.list/v1",
          items: [storageVolumeSummary()],
          generatedAt: "2026-01-01T00:00:00.000Z",
        } as T);
      }

      return ok({
        schemaVersion: "storage-volumes.show/v1",
        storageVolume: storageVolumeSummary(),
        generatedAt: "2026-01-01T00:00:00.000Z",
      } as T);
    },
  } as QueryBus;

  return mountAppaloftOrpcRoutes(new Elysia(), {
    commandBus,
    executionContextFactory: new TestExecutionContextFactory(),
    logger: new NoopLogger(),
    queryBus,
  });
}

describe("storage volume HTTP routes", () => {
  test("[STOR-ENTRY-003] dispatches storage volume CRUD through HTTP", async () => {
    const captured: Array<Command<unknown> | Query<unknown>> = [];
    const app = createApp((message) => captured.push(message));

    const createResponse = await app.handle(
      new Request("http://localhost/api/storage-volumes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: "prj_demo",
          environmentId: "env_demo",
          name: "Data",
          kind: "named-volume",
        }),
      }),
    );
    const listResponse = await app.handle(
      new Request("http://localhost/api/storage-volumes?projectId=prj_demo", {
        method: "GET",
      }),
    );
    const showResponse = await app.handle(
      new Request("http://localhost/api/storage-volumes/stv_api", { method: "GET" }),
    );
    const renameResponse = await app.handle(
      new Request("http://localhost/api/storage-volumes/stv_api/rename", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Renamed Data" }),
      }),
    );
    const deleteResponse = await app.handle(
      new Request("http://localhost/api/storage-volumes/stv_api", { method: "DELETE" }),
    );
    const cleanupRuntimeResponse = await app.handle(
      new Request("http://localhost/api/storage-volumes/stv_api/runtime-cleanup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          storageVolumeId: "stv_api",
          serverId: "srv_primary",
          before: "2026-01-01T00:05:00.000Z",
        }),
      }),
    );

    expect(createResponse.status).toBe(201);
    expect(await createResponse.json()).toEqual({ id: "stv_api" });
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toMatchObject({
      schemaVersion: "storage-volumes.list/v1",
      items: [{ id: "stv_api", attachmentCount: 1 }],
    });
    expect(showResponse.status).toBe(200);
    expect(await showResponse.json()).toMatchObject({
      schemaVersion: "storage-volumes.show/v1",
      storageVolume: { id: "stv_api", attachments: [{ attachmentId: "rsa_api" }] },
    });
    expect(renameResponse.status).toBe(200);
    expect(await renameResponse.json()).toEqual({ id: "stv_api" });
    expect(deleteResponse.status).toBe(200);
    expect(await deleteResponse.json()).toEqual({ id: "stv_api" });
    expect(cleanupRuntimeResponse.status).toBe(200);
    expect(await cleanupRuntimeResponse.json()).toMatchObject({
      schemaVersion: "storage-volumes.cleanup-runtime/v1",
      storageVolume: { id: "stv_api" },
      dryRun: true,
      summary: { matchedCount: 1, cleanedCount: 0 },
    });

    expect(captured[0]).toBeInstanceOf(CreateStorageVolumeCommand);
    expect(captured[0]).toMatchObject({
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Data",
      kind: "named-volume",
    });
    expect(captured[1]).toBeInstanceOf(ListStorageVolumesQuery);
    expect(captured[1]).toMatchObject({ projectId: "prj_demo" });
    expect(captured[2]).toBeInstanceOf(ShowStorageVolumeQuery);
    expect(captured[2]).toMatchObject({ storageVolumeId: "stv_api" });
    expect(captured[3]).toBeInstanceOf(RenameStorageVolumeCommand);
    expect(captured[3]).toMatchObject({ storageVolumeId: "stv_api", name: "Renamed Data" });
    expect(captured[4]).toBeInstanceOf(DeleteStorageVolumeCommand);
    expect(captured[4]).toMatchObject({ storageVolumeId: "stv_api" });
    expect(captured[5]).toBeInstanceOf(CleanupStorageVolumeRuntimeCommand);
    expect(captured[5]).toMatchObject({
      input: {
        storageVolumeId: "stv_api",
        serverId: "srv_primary",
        before: "2026-01-01T00:05:00.000Z",
        dryRun: true,
      },
    });
  });

  test("[STOR-ENTRY-003] dispatches resource storage attach and detach through HTTP", async () => {
    const captured: Array<Command<unknown> | Query<unknown>> = [];
    const app = createApp((message) => captured.push(message));

    const attachResponse = await app.handle(
      new Request("http://localhost/api/resources/res_web/storage-attachments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          storageVolumeId: "stv_api",
          destinationPath: "/data",
          mountMode: "read-only",
        }),
      }),
    );
    const detachResponse = await app.handle(
      new Request("http://localhost/api/resources/res_web/storage-attachments/rsa_api", {
        method: "DELETE",
      }),
    );

    expect(attachResponse.status).toBe(200);
    expect(await attachResponse.json()).toEqual({ id: "stv_api" });
    expect(detachResponse.status).toBe(200);
    expect(await detachResponse.json()).toEqual({ id: "stv_api" });
    expect(captured[0]).toBeInstanceOf(AttachResourceStorageCommand);
    expect(captured[0]).toMatchObject({
      resourceId: "res_web",
      storageVolumeId: "stv_api",
      destinationPath: "/data",
      mountMode: "read-only",
    });
    expect(captured[1]).toBeInstanceOf(DetachResourceStorageCommand);
    expect(captured[1]).toMatchObject({
      resourceId: "res_web",
      attachmentId: "rsa_api",
    });
  });
});
