import { describe, expect, test } from "bun:test";

import {
  CreatedAt,
  DescriptionText,
  EnvironmentId,
  OccurredAt,
  ProjectId,
  StorageVolumeBackup,
  StorageVolumeBackupArtifactHandle,
  StorageVolumeBackupAttemptId,
  StorageVolumeBackupConsistencyLevelValue,
  StorageVolumeBackupFailureCode,
  StorageVolumeBackupId,
  StorageVolumeBackupRetentionStatusValue,
  StorageVolumeBackupSourceAdapterKeyValue,
  StorageVolumeBackupTargetProviderKeyValue,
  StorageVolumeId,
  StorageVolumeKindValue,
  StorageVolumeRestoreAttemptId,
} from "../src";

const createdAt = CreatedAt.rehydrate("2026-07-20T00:00:00.000Z");
const requestedAt = OccurredAt.rehydrate("2026-07-20T00:00:00.000Z");
const completedAt = OccurredAt.rehydrate("2026-07-20T00:01:00.000Z");
const failedAt = OccurredAt.rehydrate("2026-07-20T00:01:30.000Z");
const restoreRequestedAt = OccurredAt.rehydrate("2026-07-20T00:02:00.000Z");
const restoreCompletedAt = OccurredAt.rehydrate("2026-07-20T00:03:00.000Z");
const prunedAt = OccurredAt.rehydrate("2026-07-20T00:04:00.000Z");

function createPendingBackup() {
  return StorageVolumeBackup.createPending({
    id: StorageVolumeBackupId.rehydrate("svb_demo"),
    storageVolumeId: StorageVolumeId.rehydrate("stv_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    storageVolumeKind: StorageVolumeKindValue.rehydrate("named-volume"),
    sourceAdapterKey: StorageVolumeBackupSourceAdapterKeyValue.rehydrate("tar-volume"),
    targetProviderKey: StorageVolumeBackupTargetProviderKeyValue.rehydrate("local-filesystem"),
    targetRef: DescriptionText.rehydrate("file:///backups/stv_demo"),
    consistency: StorageVolumeBackupConsistencyLevelValue.rehydrate("crash-consistent"),
    attemptId: StorageVolumeBackupAttemptId.rehydrate("sba_1"),
    requestedAt,
    localOnly: true,
    createdAt,
  })._unsafeUnwrap();
}

function markReady(backup: StorageVolumeBackup) {
  return backup.markReady({
    artifactHandle: StorageVolumeBackupArtifactHandle.rehydrate("backup/stv_demo/svb_demo"),
    completedAt,
    retentionStatus: StorageVolumeBackupRetentionStatusValue.retained(),
    sizeBytes: 2048,
    checksum: DescriptionText.rehydrate("sha256:demo"),
  });
}

describe("StorageVolumeBackup", () => {
  test("[CORE-STOR-BACKUP-001] creates a pending backup and blocks volume delete", () => {
    const backup = createPendingBackup();

    expect(backup.toState().status.value).toBe("pending");
    expect(backup.blocksStorageVolumeDelete()).toBe(true);
    expect(backup.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: "storage-volume-backup-requested",
        aggregateId: "svb_demo",
        payload: expect.objectContaining({
          backupId: "svb_demo",
          storageVolumeId: "stv_demo",
          sourceAdapterKey: "tar-volume",
          targetProviderKey: "local-filesystem",
          attemptId: "sba_1",
          localOnly: true,
        }),
      }),
    ]);
  });

  test("[CORE-STOR-BACKUP-002] marks a pending backup ready with retained protection", () => {
    const backup = createPendingBackup();
    backup.pullDomainEvents();

    expect(markReady(backup).isOk()).toBe(true);
    expect(backup.toState()).toMatchObject({
      status: expect.objectContaining({ value: "ready" }),
      retentionStatus: expect.objectContaining({ value: "retained" }),
      artifactHandle: expect.objectContaining({ value: "backup/stv_demo/svb_demo" }),
      sizeBytes: 2048,
    });
    expect(backup.blocksStorageVolumeDelete()).toBe(true);
    expect(backup.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: "storage-volume-backup-completed",
        payload: expect.objectContaining({
          artifactHandle: "backup/stv_demo/svb_demo",
        }),
      }),
    ]);
  });

  test("[CORE-STOR-BACKUP-003] records provider failure without an artifact handle", () => {
    const backup = createPendingBackup();
    backup.pullDomainEvents();

    const failed = backup.markFailed({
      failureCode: StorageVolumeBackupFailureCode.rehydrate("provider_error"),
      failedAt,
      failureMessage: DescriptionText.rehydrate("provider unavailable"),
    });

    expect(failed.isOk()).toBe(true);
    expect(backup.toState().status.value).toBe("failed");
    expect(backup.toState().failureCode?.value).toBe("provider_error");
    expect(backup.toState().artifactHandle).toBeUndefined();
    expect(backup.blocksStorageVolumeDelete()).toBe(false);
    expect(backup.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: "storage-volume-backup-failed",
        payload: expect.objectContaining({
          failureCode: "provider_error",
        }),
      }),
    ]);
  });

  test("[CORE-STOR-BACKUP-004] rejects ready/fail transitions after leaving pending", () => {
    const ready = createPendingBackup();
    markReady(ready)._unsafeUnwrap();

    expect(
      ready
        .markReady({
          artifactHandle: StorageVolumeBackupArtifactHandle.rehydrate("backup/other"),
          completedAt,
        })
        .isErr(),
    ).toBe(true);
    expect(
      ready
        .markFailed({
          failureCode: StorageVolumeBackupFailureCode.rehydrate("late_failure"),
          failedAt,
        })
        .isErr(),
    ).toBe(true);
  });

  test("[CORE-STOR-BACKUP-005] restores a ready backup to a non-destructive target", () => {
    const backup = createPendingBackup();
    markReady(backup)._unsafeUnwrap();
    backup.pullDomainEvents();

    const attemptId = StorageVolumeRestoreAttemptId.rehydrate("sra_1");
    const started = backup.startRestore({
      attemptId,
      requestedAt: restoreRequestedAt,
      target: {
        storageVolumeId: StorageVolumeId.rehydrate("stv_restore"),
        destructiveInPlace: false,
      },
    });
    expect(started.isOk()).toBe(true);
    expect(backup.blocksStorageVolumeDelete()).toBe(true);

    const completed = backup.markRestoreCompleted({
      attemptId,
      completedAt: restoreCompletedAt,
      restoredVolumeId: StorageVolumeId.rehydrate("stv_restored"),
    });
    expect(completed.isOk()).toBe(true);
    expect(backup.toState().latestRestoreAttempt).toMatchObject({
      status: expect.objectContaining({ value: "completed" }),
      target: expect.objectContaining({
        storageVolumeId: expect.objectContaining({ value: "stv_restore" }),
        restoredVolumeId: expect.objectContaining({ value: "stv_restored" }),
        destructiveInPlace: false,
      }),
    });
    expect(backup.pullDomainEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "storage-volume-restore-requested" }),
        expect.objectContaining({ type: "storage-volume-restore-completed" }),
      ]),
    );
  });

  test("[CORE-STOR-BACKUP-006] rejects restore while backup is not ready", () => {
    const pending = createPendingBackup();
    const rejected = pending.startRestore({
      attemptId: StorageVolumeRestoreAttemptId.rehydrate("sra_pending"),
      requestedAt: restoreRequestedAt,
      target: {
        storageVolumeId: StorageVolumeId.rehydrate("stv_restore"),
        destructiveInPlace: false,
      },
    });

    expect(rejected.isErr()).toBe(true);
    expect(rejected._unsafeUnwrapErr()).toMatchObject({
      code: "conflict",
      details: expect.objectContaining({
        phase: "storage-volume-restore-admission",
        currentStatus: "pending",
      }),
    });
  });

  test("[CORE-STOR-BACKUP-007] rejects destructive in-place restore without acknowledgement path", () => {
    const backup = createPendingBackup();
    markReady(backup)._unsafeUnwrap();

    const rejected = backup.startRestore({
      attemptId: StorageVolumeRestoreAttemptId.rehydrate("sra_destructive"),
      requestedAt: restoreRequestedAt,
      target: {
        storageVolumeId: StorageVolumeId.rehydrate("stv_demo"),
        destructiveInPlace: true,
      },
    });

    expect(rejected.isErr()).toBe(true);
    expect(rejected._unsafeUnwrapErr()).toMatchObject({
      code: "conflict",
      details: expect.objectContaining({
        phase: "storage-volume-restore-admission",
      }),
    });
    expect(rejected._unsafeUnwrapErr().message).toContain(
      "storage_volume_restore_in_place_requires_acknowledgement",
    );
  });

  test("[CORE-STOR-BACKUP-008] rejects a second concurrent restore attempt", () => {
    const backup = createPendingBackup();
    markReady(backup)._unsafeUnwrap();
    backup
      .startRestore({
        attemptId: StorageVolumeRestoreAttemptId.rehydrate("sra_1"),
        requestedAt: restoreRequestedAt,
        target: {
          storageVolumeId: StorageVolumeId.rehydrate("stv_restore"),
          destructiveInPlace: false,
        },
      })
      ._unsafeUnwrap();

    const second = backup.startRestore({
      attemptId: StorageVolumeRestoreAttemptId.rehydrate("sra_2"),
      requestedAt: OccurredAt.rehydrate("2026-07-20T00:02:30.000Z"),
      target: {
        storageVolumeId: StorageVolumeId.rehydrate("stv_restore_2"),
        destructiveInPlace: false,
      },
    });

    expect(second.isErr()).toBe(true);
    expect(second._unsafeUnwrapErr().details).toMatchObject({
      phase: "storage-volume-restore-admission",
      restoreAttemptId: "sra_1",
    });
  });

  test("[CORE-STOR-BACKUP-009] records restore failure for the active attempt only", () => {
    const backup = createPendingBackup();
    markReady(backup)._unsafeUnwrap();
    const attemptId = StorageVolumeRestoreAttemptId.rehydrate("sra_1");
    backup
      .startRestore({
        attemptId,
        requestedAt: restoreRequestedAt,
        target: {
          storageVolumeId: StorageVolumeId.rehydrate("stv_restore"),
          destructiveInPlace: false,
        },
      })
      ._unsafeUnwrap();
    backup.pullDomainEvents();

    const mismatch = backup.markRestoreFailed({
      attemptId: StorageVolumeRestoreAttemptId.rehydrate("sra_other"),
      failureCode: StorageVolumeBackupFailureCode.rehydrate("restore_mismatch"),
      failedAt,
    });
    expect(mismatch.isErr()).toBe(true);

    const failed = backup.markRestoreFailed({
      attemptId,
      failureCode: StorageVolumeBackupFailureCode.rehydrate("restore_failed"),
      failedAt,
      failureMessage: DescriptionText.rehydrate("target volume missing"),
    });
    expect(failed.isOk()).toBe(true);
    expect(backup.toState().latestRestoreAttempt).toMatchObject({
      status: expect.objectContaining({ value: "failed" }),
      failureCode: expect.objectContaining({ value: "restore_failed" }),
    });
    expect(backup.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: "storage-volume-restore-failed",
        payload: expect.objectContaining({
          failureCode: "restore_failed",
        }),
      }),
    ]);
  });

  test("[CORE-STOR-BACKUP-010] prunes terminal backups and rejects prune while restore is pending", () => {
    const ready = createPendingBackup();
    markReady(ready)._unsafeUnwrap();
    ready.pullDomainEvents();
    expect(ready.prune({ prunedAt }).isOk()).toBe(true);
    expect(ready.toState().status.value).toBe("pruned");
    expect(ready.toState().retentionStatus.value).toBe("pruned");
    expect(ready.blocksStorageVolumeDelete()).toBe(false);
    expect(ready.pullDomainEvents()).toEqual([
      expect.objectContaining({ type: "storage-volume-backup-pruned" }),
    ]);

    const pendingRestore = createPendingBackup();
    markReady(pendingRestore)._unsafeUnwrap();
    pendingRestore
      .startRestore({
        attemptId: StorageVolumeRestoreAttemptId.rehydrate("sra_1"),
        requestedAt: restoreRequestedAt,
        target: {
          storageVolumeId: StorageVolumeId.rehydrate("stv_restore"),
          destructiveInPlace: false,
        },
      })
      ._unsafeUnwrap();

    const blocked = pendingRestore.prune({ prunedAt });
    expect(blocked.isErr()).toBe(true);
    expect(blocked._unsafeUnwrapErr().details).toMatchObject({
      phase: "storage-volume-backup-prune",
      restoreAttemptId: "sra_1",
    });

    const stillPending = createPendingBackup();
    expect(stillPending.prune({ prunedAt }).isErr()).toBe(true);
  });

  test("[CORE-STOR-BACKUP-011] rejects unsupported adapter and provider vocabulary", () => {
    expect(StorageVolumeBackupSourceAdapterKeyValue.create("rsync").isErr()).toBe(true);
    expect(StorageVolumeBackupTargetProviderKeyValue.create("ftp").isErr()).toBe(true);
    expect(StorageVolumeBackupConsistencyLevelValue.create("best-effort").isErr()).toBe(true);
    expect(StorageVolumeBackupId.create("").isErr()).toBe(true);
  });
});
