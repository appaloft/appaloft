import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  AttachResourceStorageCommand,
  CleanupStorageVolumeRuntimeCommand,
  type Command,
  type CommandBus,
  CreateStorageVolumeBackupCommand,
  CreateStorageVolumeBackupPlanQuery,
  CreateStorageVolumeCommand,
  CreateStorageVolumeRestorePlanQuery,
  createExecutionContext,
  DeleteStorageVolumeCommand,
  DetachResourceStorageCommand,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListStorageVolumeBackupsQuery,
  ListStorageVolumesQuery,
  type ProductSessionAuthorizationPort,
  PruneStorageVolumeBackupCommand,
  type Query,
  type QueryBus,
  RenameStorageVolumeCommand,
  RestoreStorageVolumeBackupCommand,
  ShowStorageVolumeBackupQuery,
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
      if (command instanceof RestoreStorageVolumeBackupCommand) {
        return ok({ id: "svb_api", restoredStorageVolumeId: "stv_restored_api" } as T);
      }
      if (command instanceof PruneStorageVolumeBackupCommand) {
        return ok({
          id: "svb_api",
          prunedAt: "2026-01-01T00:00:00.000Z",
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
      if (query instanceof CreateStorageVolumeBackupPlanQuery) {
        return ok({
          schemaVersion: "storage-volumes.backup-plan/v1",
          storageVolumeId: "stv_api",
          sourceAdapterKey: "tar-volume",
          targetProviderKey: "local-filesystem",
          consistency: "quiesced",
          localOnly: true,
          retention: { maxCount: 3, minFreeBytes: 1024 },
          blockers: [],
        } as T);
      }
      if (query instanceof ListStorageVolumeBackupsQuery) {
        return ok({
          schemaVersion: "storage-volumes.backups.list/v1",
          items: [storageVolumeBackupSummary()],
          generatedAt: "2026-01-01T00:00:00.000Z",
        } as T);
      }
      if (query instanceof ShowStorageVolumeBackupQuery) {
        return ok({
          schemaVersion: "storage-volumes.backups.show/v1",
          backup: storageVolumeBackupSummary(),
          generatedAt: "2026-01-01T00:00:00.000Z",
        } as T);
      }
      if (query instanceof CreateStorageVolumeRestorePlanQuery) {
        return ok({
          schemaVersion: "storage-volumes.restore-plan/v1",
          backupId: "svb_api",
          sourceStorageVolumeId: "stv_api",
          targetMode: "new-volume",
          destructive: false,
          defaultRestoredVolumeName: "restore-stv_api-svb_api",
          blockers: [],
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
    productSessionAuthorizationPort: {
      authorizeProductSession: async (_context, input) =>
        ok({
          actor: {
            kind: "user",
            id: "usr_storage_test",
            label: "storage@example.com",
          },
          email: "storage@example.com",
          organizationId: "org_storage_test",
          role: input.requiredRole,
          userId: "usr_storage_test",
        }),
    } satisfies ProductSessionAuthorizationPort,
    queryBus,
  });
}

function storageVolumeBackupSummary() {
  return {
    id: "svb_api",
    storageVolumeId: "stv_api",
    projectId: "prj_demo",
    environmentId: "env_demo",
    resourceId: "res_web",
    storageVolumeKind: "named-volume" as const,
    sourceAdapterKey: "tar-volume",
    targetProviderKey: "local-filesystem" as const,
    targetRef: "local://backups/data",
    consistency: "quiesced",
    status: "ready" as const,
    attemptId: "sba_api",
    requestedAt: "2026-01-01T00:00:00.000Z",
    retentionStatus: "retained" as const,
    localOnly: true,
    artifactHandle: "artifact://storage-volume-backup/api",
    sizeBytes: 128,
    checksum: "sha256:test",
    completedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("storage volume HTTP routes", () => {
  const authHeaders = {
    cookie: "better-auth.session_token=test-storage-session",
  };

  test("[STOR-ENTRY-003] dispatches storage volume CRUD through HTTP", async () => {
    const captured: Array<Command<unknown> | Query<unknown>> = [];
    const app = createApp((message) => captured.push(message));

    const createResponse = await app.handle(
      new Request("http://localhost/api/storage-volumes", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
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
        headers: authHeaders,
      }),
    );
    const showResponse = await app.handle(
      new Request("http://localhost/api/storage-volumes/stv_api", {
        method: "GET",
        headers: authHeaders,
      }),
    );
    const renameResponse = await app.handle(
      new Request("http://localhost/api/storage-volumes/stv_api/rename", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({ name: "Renamed Data" }),
      }),
    );
    const deleteResponse = await app.handle(
      new Request("http://localhost/api/storage-volumes/stv_api", {
        method: "DELETE",
        headers: authHeaders,
      }),
    );
    const cleanupRuntimeResponse = await app.handle(
      new Request("http://localhost/api/storage-volumes/stv_api/runtime-cleanup", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
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

  test("[STOR-BACKUP-PLAN-001] dispatches storage volume backup and restore through HTTP", async () => {
    const captured: Array<Command<unknown> | Query<unknown>> = [];
    const app = createApp((message) => captured.push(message));

    const planResponse = await app.handle(
      new Request("http://localhost/api/storage-volumes/stv_api/backups/plan", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          source: {
            storageVolumeId: "stv_api",
            resourceId: "res_web",
            destinationPath: "/data",
            dataFormat: "filesystem",
            liveWrites: false,
          },
          requestedConsistency: "quiesced",
          target: {
            providerKey: "local-filesystem",
            targetRef: "local://backups/data",
          },
          retention: {
            maxCount: 3,
            minFreeBytes: 1024,
          },
        }),
      }),
    );
    const createResponse = await app.handle(
      new Request("http://localhost/api/storage-volumes/stv_api/backups", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          planRequest: {
            source: {
              storageVolumeId: "stv_api",
              resourceId: "res_web",
              destinationPath: "/data",
              dataFormat: "filesystem",
              liveWrites: false,
            },
            requestedConsistency: "quiesced",
            target: {
              providerKey: "local-filesystem",
              targetRef: "local://backups/data",
            },
            retention: {
              maxCount: 3,
              minFreeBytes: 1024,
            },
          },
        }),
      }),
    );
    const listResponse = await app.handle(
      new Request("http://localhost/api/storage-volumes/stv_api/backups", {
        method: "GET",
        headers: authHeaders,
      }),
    );
    const showResponse = await app.handle(
      new Request("http://localhost/api/storage-volume-backups/svb_api", {
        method: "GET",
        headers: authHeaders,
      }),
    );
    const restorePlanResponse = await app.handle(
      new Request("http://localhost/api/storage-volume-backups/svb_api/restore-plan", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({ backupId: "svb_api", targetMode: "new-volume" }),
      }),
    );
    const restoreResponse = await app.handle(
      new Request("http://localhost/api/storage-volume-backups/svb_api/restore", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({ backupId: "svb_api", targetMode: "new-volume" }),
      }),
    );
    const pruneResponse = await app.handle(
      new Request("http://localhost/api/storage-volume-backups/svb_api", {
        method: "DELETE",
        headers: authHeaders,
      }),
    );

    expect(planResponse.status).toBe(200);
    expect(await planResponse.json()).toMatchObject({
      schemaVersion: "storage-volumes.backup-plan/v1",
      storageVolumeId: "stv_api",
      blockers: [],
    });
    expect(createResponse.status).toBe(201);
    expect(await createResponse.json()).toEqual({ id: "stv_api" });
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toMatchObject({
      schemaVersion: "storage-volumes.backups.list/v1",
      items: [{ id: "svb_api", storageVolumeId: "stv_api" }],
    });
    expect(showResponse.status).toBe(200);
    expect(await showResponse.json()).toMatchObject({
      schemaVersion: "storage-volumes.backups.show/v1",
      backup: { id: "svb_api", storageVolumeId: "stv_api" },
    });
    expect(restorePlanResponse.status).toBe(200);
    expect(await restorePlanResponse.json()).toMatchObject({
      schemaVersion: "storage-volumes.restore-plan/v1",
      backupId: "svb_api",
      targetMode: "new-volume",
      blockers: [],
    });
    expect(restoreResponse.status).toBe(200);
    expect(await restoreResponse.json()).toEqual({
      id: "svb_api",
      restoredStorageVolumeId: "stv_restored_api",
    });
    expect(pruneResponse.status).toBe(200);
    expect(await pruneResponse.json()).toEqual({
      id: "svb_api",
      prunedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(captured[0]).toBeInstanceOf(CreateStorageVolumeBackupPlanQuery);
    expect(captured[1]).toBeInstanceOf(CreateStorageVolumeBackupCommand);
    expect(captured[2]).toBeInstanceOf(ListStorageVolumeBackupsQuery);
    expect(captured[3]).toBeInstanceOf(ShowStorageVolumeBackupQuery);
    expect(captured[4]).toBeInstanceOf(CreateStorageVolumeRestorePlanQuery);
    expect(captured[5]).toBeInstanceOf(RestoreStorageVolumeBackupCommand);
    expect(captured[6]).toBeInstanceOf(PruneStorageVolumeBackupCommand);
  });

  test("[STOR-ENTRY-003] dispatches resource storage attach and detach through HTTP", async () => {
    const captured: Array<Command<unknown> | Query<unknown>> = [];
    const app = createApp((message) => captured.push(message));

    const attachResponse = await app.handle(
      new Request("http://localhost/api/resources/res_web/storage-attachments", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
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
        headers: authHeaders,
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
