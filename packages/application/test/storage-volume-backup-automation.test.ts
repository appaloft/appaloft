import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { FixedClock, SequenceIdGenerator } from "@appaloft/testkit";

import { type Command } from "../src/cqrs";
import {
  createExecutionContext,
  type ExecutionContext,
  type RepositoryContext,
} from "../src/execution-context";
import {
  FakeNotificationConnectorProviderAdapter,
  InMemoryConnectorProviderAdapterRegistry,
} from "../src/extensibility";
import { CreateStorageVolumeBackupCommand } from "../src/operations/storage-volumes/create-storage-volume-backup.command";
import { PruneStorageVolumeBackupCommand } from "../src/operations/storage-volumes/prune-storage-volume-backup.command";
import {
  type BackupAutomationNotificationPort,
  ConfigureStorageVolumeBackupPolicyCommand,
  ConfigureStorageVolumeBackupPolicyUseCase,
  ConnectorBackupAutomationNotificationPort,
  StorageVolumeBackupAutomationService,
  type StorageVolumeBackupPolicyRecord,
  type StorageVolumeBackupPolicyRepository,
} from "../src/operations/storage-volumes/storage-volume-backup-automation";
import {
  type ProcessAttemptClaimer,
  type ProcessAttemptClaimInput,
  type ProcessAttemptClaimResult,
  type ProcessAttemptCompleter,
  type ProcessAttemptCompletionInput,
  type ProcessAttemptCompletionResult,
  type ProcessAttemptRecord,
  type ProcessAttemptRecorder,
  type StorageVolumeBackupReadModel,
  type StorageVolumeBackupSummary,
} from "../src/ports";

class MemoryPolicies implements StorageVolumeBackupPolicyRepository {
  records = new Map<string, StorageVolumeBackupPolicyRecord>();
  failRecordRun = false;
  async findOne(_context: RepositoryContext, id: string) {
    return ok(this.records.get(id) ?? null);
  }
  async listRecords(
    _context: RepositoryContext,
    filter: Parameters<StorageVolumeBackupPolicyRepository["listRecords"]>[1] = {},
  ) {
    const items = [...this.records.values()].filter(
      (item) =>
        (!filter?.storageVolumeId || item.storageVolumeId === filter.storageVolumeId) &&
        (!filter?.scheduledEnabledOnly || item.scheduledEnabled) &&
        (!filter?.preDeployEnabledOnly || item.preDeployEnabled) &&
        (!filter?.dueAt || item.nextRunAt <= filter.dueAt),
    );
    return ok(filter?.limit ? items.slice(0, filter.limit) : items);
  }
  async claimScheduledRun() {
    return ok(true);
  }
  async upsert(_context: RepositoryContext, record: StorageVolumeBackupPolicyRecord) {
    this.records.set(record.id, record);
    return ok(record);
  }
  async recordRun(
    _context: RepositoryContext,
    input: Parameters<StorageVolumeBackupPolicyRepository["recordRun"]>[1],
  ) {
    if (this.failRecordRun) {
      return err(domainError.infra("policy readback unavailable", { phase: "test" }));
    }
    const record = this.records.get(input.id);
    if (!record) return err(domainError.notFound("storage_volume_backup_policy", input.id));
    const updated = { ...record, ...input };
    this.records.set(input.id, updated);
    return ok(updated);
  }
}

class Attempts implements ProcessAttemptRecorder, ProcessAttemptClaimer, ProcessAttemptCompleter {
  records: ProcessAttemptRecord[] = [];
  completions: ProcessAttemptCompletionInput[] = [];
  async record(_context: RepositoryContext, record: ProcessAttemptRecord) {
    this.records.push(record);
    return ok(record);
  }
  async claimDue(
    _context: RepositoryContext,
    input: ProcessAttemptClaimInput,
  ): Promise<Result<ProcessAttemptClaimResult>> {
    return ok({
      status: "claimed",
      attempt: {
        id: input.attemptId,
        kind: "system",
        status: "running",
        operationKey: "storage-volumes.create-backup",
        updatedAt: input.claimedAt,
        nextActions: ["no-action"],
      },
    });
  }
  async complete(
    _context: RepositoryContext,
    input: ProcessAttemptCompletionInput,
  ): Promise<Result<ProcessAttemptCompletionResult>> {
    this.completions.push(input);
    return ok({
      status: "completed",
      attempt: {
        id: input.attemptId,
        kind: "system",
        status: input.status,
        operationKey: "storage-volumes.create-backup",
        updatedAt: input.completedAt,
        nextActions: input.nextActions,
      },
    });
  }
}

const summary = (id: string, createdAt: string): StorageVolumeBackupSummary => ({
  id,
  storageVolumeId: "stv_data",
  projectId: "prj_test",
  environmentId: "env_test",
  storageVolumeKind: "named-volume",
  sourceAdapterKey: "tar-volume",
  targetProviderKey: "s3-compatible",
  targetRef: "s3://backup/data",
  consistency: "crash-consistent",
  status: "ready",
  attemptId: `sba_${id}`,
  requestedAt: createdAt,
  retentionStatus: "retained",
  localOnly: false,
  artifactHandle: `s3obj:${id}`,
  checksum: `sha256:${id}`,
  completedAt: createdAt,
  createdAt,
});

describe("storage volume backup automation", () => {
  test("[STOR-BACKUP-AUTO-NOTIFY-005] sends a safe failure message through the configured connector", async () => {
    const notification = new ConnectorBackupAutomationNotificationPort(
      new InMemoryConnectorProviderAdapterRegistry([
        new FakeNotificationConnectorProviderAdapter({
          connectorKey: "conn_alerts",
          providerKey: "slack",
          providerTitle: "Slack",
          defaultChannelRef: "#backup-alerts",
        }),
      ]),
    );
    const result = await notification.notifyFailure(
      createExecutionContext({ requestId: "req_notification", entrypoint: "system" }),
      {
        notificationRef: "conn_alerts",
        policyId: "sbp_data",
        storageVolumeId: "stv_data",
        trigger: "scheduled",
        processAttemptId: "wrk_backup",
        errorCode: "provider_error",
        occurredAt: "2026-07-20T00:00:00.000Z",
      },
    );

    expect(result.isOk()).toBe(true);
    expect(JSON.stringify(result)).not.toContain("token");
    expect(JSON.stringify(result)).not.toContain("secret");

    const unavailable = new ConnectorBackupAutomationNotificationPort(
      new InMemoryConnectorProviderAdapterRegistry([]),
    );
    const missing = await unavailable.notifyFailure(
      createExecutionContext({ requestId: "req_notification_missing", entrypoint: "system" }),
      {
        notificationRef: "conn_missing",
        policyId: "sbp_data",
        storageVolumeId: "stv_data",
        trigger: "scheduled",
        processAttemptId: "wrk_backup",
        errorCode: "provider_error",
        occurredAt: "2026-07-20T00:00:00.000Z",
      },
    );
    expect(missing.isErr()).toBe(true);
    expect(missing._unsafeUnwrapErr().code).toBe("provider_capability_unsupported");
  });

  test("[STOR-BACKUP-AUTO-POLICY-001] configures safe scheduled and pre-deploy policy", async () => {
    const repository = new MemoryPolicies();
    const useCase = new ConfigureStorageVolumeBackupPolicyUseCase(
      repository,
      new FixedClock("2026-07-20T00:00:00.000Z"),
      new SequenceIdGenerator(),
    );
    const command = ConfigureStorageVolumeBackupPolicyCommand.create({
      storageVolumeId: "stv_data",
      scheduledEnabled: true,
      preDeployEnabled: true,
      scheduleIntervalHours: 6,
      planRequest: {
        source: { storageVolumeId: "stv_data", dataFormat: "filesystem", liveWrites: false },
        requestedConsistency: "crash-consistent",
        target: {
          providerKey: "s3-compatible",
          targetRef: "s3://backup/data",
          secretRef: "secret:r2",
        },
        retention: { maxCount: 2, maxAgeDays: 7 },
      },
    })._unsafeUnwrap();
    const result = await useCase.execute(
      createExecutionContext({ requestId: "req_policy", entrypoint: "cli" }),
      command.input,
    );
    expect(result.isOk()).toBe(true);
    expect(repository.records.get(result._unsafeUnwrap().id)).toMatchObject({
      scheduledEnabled: true,
      preDeployEnabled: true,
      failureMode: "block",
    });
  });

  test("[STOR-BACKUP-AUTO-SCHEDULE-002][STOR-BACKUP-AUTO-RETENTION-004] schedules existing backup command and prunes only after verified artifact", async () => {
    const repository = new MemoryPolicies();
    const attempts = new Attempts();
    const commands: Command<unknown>[] = [];
    const backupReadModel: StorageVolumeBackupReadModel = {
      async list() {
        return [
          summary("svb_new", "2026-07-20T00:00:00.000Z"),
          summary("svb_old", "2026-07-01T00:00:00.000Z"),
        ];
      },
      async findOne() {
        return null;
      },
    };
    const commandBus = {
      async execute<TResult>(
        _context: ExecutionContext,
        command: Command<TResult>,
      ): Promise<Result<TResult>> {
        commands.push(command as Command<unknown>);
        if (command instanceof CreateStorageVolumeBackupCommand)
          return ok({ id: "svb_new" } as TResult);
        return ok({ id: "svb_old", prunedAt: "2026-07-20T00:00:01.000Z" } as TResult);
      },
    };
    const notifications: BackupAutomationNotificationPort = {
      async notifyFailure() {
        return ok({ deliveredAt: "2026-07-20T00:00:00.000Z" });
      },
    };
    const policy: StorageVolumeBackupPolicyRecord = {
      id: "sbp_data",
      version: "v1",
      storageVolumeId: "stv_data",
      planRequest: {
        source: { storageVolumeId: "stv_data", dataFormat: "filesystem", liveWrites: false },
        requestedConsistency: "crash-consistent",
        target: { providerKey: "s3-compatible", targetRef: "s3://backup/data" },
        retention: { maxCount: 1, maxAgeDays: 7 },
      },
      scheduledEnabled: true,
      preDeployEnabled: true,
      scheduleIntervalHours: 24,
      retryOnFailure: true,
      failureMode: "block",
      notificationRef: "conn_alerts",
      lastRunAt: null,
      nextRunAt: "2026-07-20T00:00:00.000Z",
      lastTrigger: null,
      lastStatus: "never",
      lastBackupId: null,
      lastProcessAttemptId: null,
      lastPrunedCount: 0,
      lastNotificationStatus: "not-requested",
      lastErrorCode: null,
      updatedAt: "2026-07-20T00:00:00.000Z",
    };
    repository.records.set(policy.id, policy);
    const service = new StorageVolumeBackupAutomationService(
      commandBus,
      repository,
      backupReadModel,
      attempts,
      attempts,
      attempts,
      notifications,
      new SequenceIdGenerator(),
      new FixedClock("2026-07-20T00:00:01.000Z"),
    );
    const result = await service.runDue(
      createExecutionContext({ requestId: "req_schedule", entrypoint: "system" }),
      "2026-07-20T00:00:00.000Z",
    );
    expect(result._unsafeUnwrap()).toEqual({ completed: 1, failed: 0 });
    expect(commands[0]).toBeInstanceOf(CreateStorageVolumeBackupCommand);
    expect(commands[1]).toBeInstanceOf(PruneStorageVolumeBackupCommand);
    expect(repository.records.get(policy.id)).toMatchObject({
      lastStatus: "succeeded",
      lastBackupId: "svb_new",
      lastPrunedCount: 1,
      nextRunAt: "2026-07-21T00:00:00.000Z",
    });
    expect(attempts.completions.at(-1)).toMatchObject({ status: "succeeded" });

    repository.failRecordRun = true;
    const readbackFailure = await service.runDue(
      createExecutionContext({ requestId: "req_schedule_readback_failure", entrypoint: "system" }),
      "2026-07-21T00:00:00.000Z",
    );
    expect(readbackFailure._unsafeUnwrap()).toEqual({ completed: 0, failed: 1 });
  });

  test("[STOR-BACKUP-AUTO-PREDEPLOY-003][STOR-BACKUP-AUTO-NOTIFY-005] blocks pre-deploy and records delivered failure notification", async () => {
    const repository = new MemoryPolicies();
    const attempts = new Attempts();
    const policy: StorageVolumeBackupPolicyRecord = {
      id: "sbp_block",
      version: "v1",
      storageVolumeId: "stv_data",
      planRequest: {
        source: { storageVolumeId: "stv_data" },
        requestedConsistency: "crash-consistent",
        target: { providerKey: "s3-compatible", targetRef: "s3://backup/data" },
        retention: { maxCount: 2 },
      },
      scheduledEnabled: false,
      preDeployEnabled: true,
      scheduleIntervalHours: 24,
      retryOnFailure: false,
      failureMode: "block",
      notificationRef: "conn_alerts",
      lastRunAt: null,
      nextRunAt: "2026-07-20T00:00:00.000Z",
      lastTrigger: null,
      lastStatus: "never",
      lastBackupId: null,
      lastProcessAttemptId: null,
      lastPrunedCount: 0,
      lastNotificationStatus: "not-requested",
      lastErrorCode: null,
      updatedAt: "2026-07-20T00:00:00.000Z",
    };
    repository.records.set(policy.id, policy);
    let notified = false;
    const service = new StorageVolumeBackupAutomationService(
      {
        async execute() {
          return err(domainError.infra("backup failed", { phase: "test" }));
        },
      },
      repository,
      {
        async list() {
          return [];
        },
        async findOne() {
          return null;
        },
      },
      attempts,
      attempts,
      attempts,
      {
        async notifyFailure() {
          notified = true;
          return ok({ deliveredAt: "2026-07-20T00:00:01.000Z" });
        },
      },
      new SequenceIdGenerator(),
      new FixedClock("2026-07-20T00:00:01.000Z"),
    );
    const result = await service.runPreDeploy(
      createExecutionContext({ requestId: "req_predeploy", entrypoint: "http" }),
      "res_app",
    );
    expect(result.isErr()).toBe(true);
    expect(notified).toBe(true);
    expect(repository.records.get(policy.id)).toMatchObject({
      lastStatus: "failed",
      lastNotificationStatus: "delivered",
    });
  });
});
