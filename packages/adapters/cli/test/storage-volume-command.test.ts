import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  AttachResourceStorageCommand,
  CleanupStorageVolumeRuntimeCommand,
  type CommandBus,
  CreateStorageVolumeBackupCommand,
  CreateStorageVolumeBackupPlanQuery,
  CreateStorageVolumeCommand,
  CreateStorageVolumeRestorePlanQuery,
  createExecutionContext,
  DeleteStorageVolumeCommand,
  DetachResourceStorageCommand,
  type ExecutionContextFactory,
  ListStorageVolumeBackupsQuery,
  ListStorageVolumesQuery,
  PruneStorageVolumeBackupCommand,
  type QueryBus,
  RenameStorageVolumeCommand,
  RestoreStorageVolumeBackupCommand,
  ShowStorageVolumeBackupQuery,
  ShowStorageVolumeQuery,
} from "@appaloft/application";
import { ok } from "@appaloft/core";

function ensureReflectMetadata(): void {
  const reflectObject = Reflect as typeof Reflect & {
    defineMetadata?: (...args: unknown[]) => void;
    getMetadata?: (...args: unknown[]) => unknown;
    getOwnMetadata?: (...args: unknown[]) => unknown;
    hasMetadata?: (...args: unknown[]) => boolean;
    metadata?: (_metadataKey: unknown, _metadataValue: unknown) => ClassDecorator;
  };

  reflectObject.defineMetadata ??= () => {};
  reflectObject.getMetadata ??= () => undefined;
  reflectObject.getOwnMetadata ??= () => undefined;
  reflectObject.hasMetadata ??= () => false;
  reflectObject.metadata ??= () => () => {};
}

function createHarness() {
  const commands: AppCommand<unknown>[] = [];
  const queries: AppQuery<unknown>[] = [];
  const commandBus = {
    execute: async <T>(_context: unknown, command: AppCommand<T>) => {
      commands.push(command as AppCommand<unknown>);
      return ok({ id: "stv_cli" } as T);
    },
  } as unknown as CommandBus;
  const queryBus = {
    execute: async <T>(_context: unknown, query: AppQuery<T>) => {
      queries.push(query as AppQuery<unknown>);
      if (query instanceof ListStorageVolumesQuery) {
        return ok({
          schemaVersion: "storage-volumes.list/v1",
          items: [],
          generatedAt: "2026-01-01T00:00:00.000Z",
        } as T);
      }
      if (query instanceof CreateStorageVolumeBackupPlanQuery) {
        return ok({
          schemaVersion: "storage-volumes.backup-plan/v1",
          storageVolumeId: "stv_cli",
          sourceAdapterKey: "unsupported",
          targetProviderKey: "local-filesystem",
          consistency: "application-consistent",
          localOnly: true,
          retention: { maxCount: 2, minFreeBytes: 1024 },
          blockers: [],
        } as T);
      }
      if (query instanceof ListStorageVolumeBackupsQuery) {
        return ok({
          schemaVersion: "storage-volumes.backups.list/v1",
          items: [],
          generatedAt: "2026-01-01T00:00:00.000Z",
        } as T);
      }
      if (query instanceof ShowStorageVolumeBackupQuery) {
        return ok({
          schemaVersion: "storage-volumes.backups.show/v1",
          backup: {
            id: "svb_cli",
            storageVolumeId: "stv_cli",
            projectId: "prj_demo",
            environmentId: "env_demo",
            storageVolumeKind: "named-volume",
            sourceAdapterKey: "tar-volume",
            targetProviderKey: "local-filesystem",
            targetRef: "/backups",
            consistency: "quiesced",
            status: "ready",
            attemptId: "sba_cli",
            requestedAt: "2026-01-01T00:00:00.000Z",
            retentionStatus: "retained",
            localOnly: true,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          generatedAt: "2026-01-01T00:00:00.000Z",
        } as T);
      }
      if (query instanceof CreateStorageVolumeRestorePlanQuery) {
        return ok({
          schemaVersion: "storage-volumes.restore-plan/v1",
          backupId: "svb_cli",
          targetMode: "new-volume",
          destructive: false,
          blockers: [],
          warnings: [],
        } as T);
      }

      return ok({
        schemaVersion: "storage-volumes.show/v1",
        storageVolume: {
          id: "stv_cli",
          projectId: "prj_demo",
          environmentId: "env_demo",
          name: "Data",
          slug: "data",
          kind: "named-volume",
          lifecycleStatus: "active",
          attachmentCount: 1,
          attachments: [
            {
              attachmentId: "rsa_cli",
              resourceId: "res_pocketbase",
              resourceName: "PocketBase",
              resourceSlug: "pocketbase",
              destinationPath: "/pb_data",
              mountMode: "read-write",
              dataFormat: "sqlite",
              applicationDataLabel: "PocketBase data",
              attachedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        generatedAt: "2026-01-01T00:00:00.000Z",
      } as T);
    },
  } as unknown as QueryBus;
  const executionContextFactory: ExecutionContextFactory = {
    create: (input) =>
      createExecutionContext({
        ...input,
        requestId: "req_cli_storage_volume_test",
      }),
  };

  return { commandBus, commands, executionContextFactory, queries, queryBus };
}

async function runCli(args: string[], harness = createHarness()) {
  ensureReflectMetadata();
  const { createCliProgram } = await import("../src");
  const program = createCliProgram({
    version: "0.1.0-test",
    startServer: async () => {},
    commandBus: harness.commandBus,
    queryBus: harness.queryBus,
    executionContextFactory: harness.executionContextFactory,
  });
  const writeStdout = process.stdout.write;
  try {
    process.stdout.write = (() => true) as typeof process.stdout.write;
    await program.parseAsync(["node", "appaloft", ...args]);
  } finally {
    process.stdout.write = writeStdout;
  }

  return harness;
}

describe("CLI storage volume commands", () => {
  test("[STOR-ENTRY-002] storage volume commands dispatch shared application messages", async () => {
    const harness = createHarness();

    await runCli(
      [
        "storage",
        "volume",
        "create",
        "--project",
        "prj_demo",
        "--environment",
        "env_demo",
        "--name",
        "Data",
        "--kind",
        "named-volume",
      ],
      harness,
    );
    await runCli(["storage", "volume", "list", "--project", "prj_demo"], harness);
    await runCli(["storage", "volume", "show", "stv_cli"], harness);
    await runCli(["storage", "volume", "rename", "stv_cli", "--name", "Renamed Data"], harness);
    await runCli(["storage", "volume", "delete", "stv_cli"], harness);
    await runCli(
      [
        "storage",
        "volume",
        "cleanup-runtime",
        "stv_cli",
        "--server",
        "srv_primary",
        "--before",
        "2026-01-01T00:05:00.000Z",
      ],
      harness,
    );
    await runCli(
      [
        "storage",
        "volume",
        "cleanup-runtime",
        "stv_cli",
        "--server",
        "srv_primary",
        "--before",
        "2026-01-01T00:05:00.000Z",
        "--dry-run",
        "false",
      ],
      harness,
    );

    expect(harness.commands[0]).toBeInstanceOf(CreateStorageVolumeCommand);
    expect(harness.commands[0]).toMatchObject({
      projectId: "prj_demo",
      environmentId: "env_demo",
      name: "Data",
      kind: "named-volume",
    });
    expect(harness.queries[0]).toBeInstanceOf(ListStorageVolumesQuery);
    expect(harness.queries[0]).toMatchObject({ projectId: "prj_demo" });
    expect(harness.queries[1]).toBeInstanceOf(ShowStorageVolumeQuery);
    expect(harness.queries[1]).toMatchObject({ storageVolumeId: "stv_cli" });
    expect(
      (
        await harness.queryBus.execute(
          createExecutionContext({
            requestId: "req_cli_storage_volume_show_metadata",
            entrypoint: "cli",
          }),
          ShowStorageVolumeQuery.create({ storageVolumeId: "stv_cli" })._unsafeUnwrap(),
        )
      )._unsafeUnwrap(),
    ).toMatchObject({
      storageVolume: {
        attachments: [
          {
            destinationPath: "/pb_data",
            dataFormat: "sqlite",
            applicationDataLabel: "PocketBase data",
          },
        ],
      },
    });
    expect(harness.commands[1]).toBeInstanceOf(RenameStorageVolumeCommand);
    expect(harness.commands[1]).toMatchObject({
      storageVolumeId: "stv_cli",
      name: "Renamed Data",
    });
    expect(harness.commands[2]).toBeInstanceOf(DeleteStorageVolumeCommand);
    expect(harness.commands[2]).toMatchObject({ storageVolumeId: "stv_cli" });
    expect(harness.commands[3]).toBeInstanceOf(CleanupStorageVolumeRuntimeCommand);
    expect(harness.commands[3]).toMatchObject({
      input: {
        storageVolumeId: "stv_cli",
        serverId: "srv_primary",
        before: "2026-01-01T00:05:00.000Z",
        dryRun: true,
      },
    });
    expect(harness.commands[4]).toBeInstanceOf(CleanupStorageVolumeRuntimeCommand);
    expect(harness.commands[4]).toMatchObject({
      input: {
        storageVolumeId: "stv_cli",
        serverId: "srv_primary",
        before: "2026-01-01T00:05:00.000Z",
        dryRun: false,
      },
    });
  });

  test("[STOR-ENTRY-002] resource storage attach and detach dispatch shared application commands", async () => {
    const harness = createHarness();

    await runCli(
      [
        "resource",
        "storage",
        "attach",
        "res_web",
        "stv_cli",
        "--destination-path",
        "/data",
        "--mount-mode",
        "read-only",
      ],
      harness,
    );
    await runCli(["resource", "storage", "detach", "res_web", "rsa_cli"], harness);

    expect(harness.commands[0]).toBeInstanceOf(AttachResourceStorageCommand);
    expect(harness.commands[0]).toMatchObject({
      resourceId: "res_web",
      storageVolumeId: "stv_cli",
      destinationPath: "/data",
      mountMode: "read-only",
    });
    expect(harness.commands[1]).toBeInstanceOf(DetachResourceStorageCommand);
    expect(harness.commands[1]).toMatchObject({
      resourceId: "res_web",
      attachmentId: "rsa_cli",
    });
  });

  test("[STOR-BACKUP-PLAN-001] storage volume backup commands dispatch shared application messages", async () => {
    const harness = createHarness();

    await runCli(
      [
        "storage",
        "volume",
        "backup",
        "plan",
        "--storage-volume",
        "stv_cli",
        "--resource",
        "res_cli",
        "--attachment",
        "rsa_cli",
        "--destination-path",
        "/pb_data",
        "--data-format",
        "sqlite",
        "--live-writes",
        "true",
        "--consistency",
        "application-consistent",
        "--source-adapter",
        "sqlite-online-backup",
        "--target-provider",
        "local-filesystem",
        "--target-ref",
        "/var/lib/appaloft/backups",
        "--failure-domain",
        "host:srv_cli",
        "--retention-max-count",
        "2",
        "--retention-min-free-bytes",
        "1024",
      ],
      harness,
    );
    await runCli(
      [
        "storage",
        "volume",
        "backup",
        "create",
        "--storage-volume",
        "stv_cli",
        "--target-ref",
        "/var/lib/appaloft/backups",
        "--retention-max-count",
        "2",
        "--retention-min-free-bytes",
        "1024",
      ],
      harness,
    );
    await runCli(
      ["storage", "volume", "backup", "list", "--storage-volume", "stv_cli", "--status", "ready"],
      harness,
    );
    await runCli(["storage", "volume", "backup", "show", "svb_cli"], harness);
    await runCli(["storage", "volume", "backup", "restore-plan", "svb_cli"], harness);
    await runCli(
      [
        "storage",
        "volume",
        "backup",
        "restore",
        "svb_cli",
        "--target-mode",
        "new-volume",
        "--restored-volume-name",
        "PocketBase restore",
      ],
      harness,
    );
    await runCli(["storage", "volume", "backup", "prune", "svb_cli"], harness);

    expect(harness.queries[0]).toBeInstanceOf(CreateStorageVolumeBackupPlanQuery);
    expect(harness.queries[0]).toMatchObject({
      request: {
        source: {
          storageVolumeId: "stv_cli",
          resourceId: "res_cli",
          attachmentId: "rsa_cli",
          destinationPath: "/pb_data",
          dataFormat: "sqlite",
          liveWrites: true,
        },
        requestedConsistency: "application-consistent",
        preferredSourceAdapter: "sqlite-online-backup",
        target: {
          providerKey: "local-filesystem",
          targetRef: "/var/lib/appaloft/backups",
          failureDomain: "host:srv_cli",
        },
        retention: {
          maxCount: 2,
          minFreeBytes: 1024,
        },
      },
    });
    expect(harness.commands[0]).toBeInstanceOf(CreateStorageVolumeBackupCommand);
    expect(harness.commands[0]).toMatchObject({
      planRequest: {
        source: {
          storageVolumeId: "stv_cli",
          liveWrites: true,
        },
        requestedConsistency: "application-consistent",
        target: {
          providerKey: "local-filesystem",
          targetRef: "/var/lib/appaloft/backups",
        },
        retention: {
          maxCount: 2,
          minFreeBytes: 1024,
        },
      },
    });
    expect(harness.queries[1]).toBeInstanceOf(ListStorageVolumeBackupsQuery);
    expect(harness.queries[1]).toMatchObject({
      storageVolumeId: "stv_cli",
      status: "ready",
    });
    expect(harness.queries[2]).toBeInstanceOf(ShowStorageVolumeBackupQuery);
    expect(harness.queries[2]).toMatchObject({ backupId: "svb_cli" });
    expect(harness.queries[3]).toBeInstanceOf(CreateStorageVolumeRestorePlanQuery);
    expect(harness.queries[3]).toMatchObject({
      backupId: "svb_cli",
      targetMode: "new-volume",
    });
    expect(harness.commands[1]).toBeInstanceOf(RestoreStorageVolumeBackupCommand);
    expect(harness.commands[1]).toMatchObject({
      backupId: "svb_cli",
      targetMode: "new-volume",
      restoredVolumeName: "PocketBase restore",
    });
    expect(harness.commands[2]).toBeInstanceOf(PruneStorageVolumeBackupCommand);
    expect(harness.commands[2]).toMatchObject({ backupId: "svb_cli" });
  });
});
