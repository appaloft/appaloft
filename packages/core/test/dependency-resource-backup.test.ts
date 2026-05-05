import { describe, expect, test } from "bun:test";

import {
  CreatedAt,
  DependencyResourceBackup,
  DependencyResourceBackupAttemptId,
  DependencyResourceBackupFailureCode,
  DependencyResourceBackupId,
  DependencyResourceBackupRetentionStatusValue,
  DependencyResourceProviderArtifactHandle,
  DependencyResourceRestoreAttemptId,
  EnvironmentId,
  OccurredAt,
  ProjectId,
  ProviderKey,
  ResourceInstanceId,
  ResourceInstanceKindValue,
} from "../src";

function createPendingBackup(): DependencyResourceBackup {
  return DependencyResourceBackup.createPending({
    id: DependencyResourceBackupId.rehydrate("drb_1"),
    dependencyResourceId: ResourceInstanceId.rehydrate("rsi_pg"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    dependencyKind: ResourceInstanceKindValue.rehydrate("postgres"),
    providerKey: ProviderKey.rehydrate("appaloft-managed-postgres"),
    attemptId: DependencyResourceBackupAttemptId.rehydrate("dba_1"),
    requestedAt: OccurredAt.rehydrate("2026-01-01T00:00:00.000Z"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();
}

describe("dependency resource backup aggregate", () => {
  test("[DEP-RES-BACKUP-001] creates a pending backup and emits requested event", () => {
    const backup = createPendingBackup();

    expect(backup.toState()).toMatchObject({
      status: expect.objectContaining({ value: "pending" }),
      retentionStatus: expect.objectContaining({ value: "none" }),
    });
    expect(backup.blocksDependencyResourceDelete()).toBe(true);
    expect(backup.pullDomainEvents()).toContainEqual(
      expect.objectContaining({
        type: "dependency-resource-backup-requested",
        aggregateId: "drb_1",
      }),
    );
  });

  test("[DEP-RES-BACKUP-002] marks a backup ready and retains delete protection", () => {
    const backup = createPendingBackup();
    backup.pullDomainEvents();

    const result = backup.markReady({
      providerArtifactHandle:
        DependencyResourceProviderArtifactHandle.rehydrate("backup/rsi_pg/drb_1"),
      completedAt: OccurredAt.rehydrate("2026-01-01T00:00:01.000Z"),
      retentionStatus: DependencyResourceBackupRetentionStatusValue.retained(),
    });

    expect(result.isOk()).toBe(true);
    expect(backup.toState()).toMatchObject({
      status: expect.objectContaining({ value: "ready" }),
      retentionStatus: expect.objectContaining({ value: "retained" }),
      providerArtifactHandle: expect.objectContaining({ value: "backup/rsi_pg/drb_1" }),
    });
    expect(backup.blocksDependencyResourceDelete()).toBe(true);
    expect(backup.pullDomainEvents()).toContainEqual(
      expect.objectContaining({
        type: "dependency-resource-backup-completed",
        aggregateId: "drb_1",
      }),
    );
  });

  test("[DEP-RES-BACKUP-006] records restore attempt lifecycle", () => {
    const backup = createPendingBackup();
    backup.markReady({
      providerArtifactHandle:
        DependencyResourceProviderArtifactHandle.rehydrate("backup/rsi_pg/drb_1"),
      completedAt: OccurredAt.rehydrate("2026-01-01T00:00:01.000Z"),
      retentionStatus: DependencyResourceBackupRetentionStatusValue.retained(),
    });
    backup.pullDomainEvents();
    const attemptId = DependencyResourceRestoreAttemptId.rehydrate("dra_1");

    const started = backup.startRestore({
      attemptId,
      requestedAt: OccurredAt.rehydrate("2026-01-01T00:01:00.000Z"),
    });
    const completed = backup.markRestoreCompleted({
      attemptId,
      completedAt: OccurredAt.rehydrate("2026-01-01T00:02:00.000Z"),
    });

    expect(started.isOk()).toBe(true);
    expect(completed.isOk()).toBe(true);
    expect(backup.toState().latestRestoreAttempt).toMatchObject({
      status: expect.objectContaining({ value: "completed" }),
    });
    expect(backup.pullDomainEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "dependency-resource-restore-requested" }),
        expect.objectContaining({ type: "dependency-resource-restore-completed" }),
      ]),
    );
  });

  test("[DEP-RES-BACKUP-003] marks provider failures without an artifact handle", () => {
    const backup = createPendingBackup();
    backup.pullDomainEvents();

    const result = backup.markFailed({
      failureCode: DependencyResourceBackupFailureCode.rehydrate("provider_error"),
      failedAt: OccurredAt.rehydrate("2026-01-01T00:00:01.000Z"),
    });

    expect(result.isOk()).toBe(true);
    expect(backup.toState()).toMatchObject({
      status: expect.objectContaining({ value: "failed" }),
      failureCode: expect.objectContaining({ value: "provider_error" }),
    });
    expect(backup.blocksDependencyResourceDelete()).toBe(false);
  });
});
