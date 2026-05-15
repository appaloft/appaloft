import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  createExecutionContext,
  type DependencyResourceBackupPolicyRecord,
  type DependencyResourceBackupPolicyRepository,
  type ExecutionContext,
  type ExecutionContextFactory,
  type RepositoryContext,
  type ScheduledDependencyBackupRunResult,
  type ScheduledDependencyBackupService,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";

import { createScheduledDependencyBackupRunner } from "../src/scheduled-dependency-backup-runner";

class CapturingLogger implements AppLogger {
  readonly messages: Array<{ level: string; message: string; details?: Record<string, unknown> }> =
    [];

  debug(message: string, details?: Record<string, unknown>): void {
    this.messages.push({ level: "debug", message, ...(details ? { details } : {}) });
  }

  info(message: string, details?: Record<string, unknown>): void {
    this.messages.push({ level: "info", message, ...(details ? { details } : {}) });
  }

  warn(message: string, details?: Record<string, unknown>): void {
    this.messages.push({ level: "warn", message, ...(details ? { details } : {}) });
  }

  error(message: string, details?: Record<string, unknown>): void {
    this.messages.push({ level: "error", message, ...(details ? { details } : {}) });
  }
}

class FixedExecutionContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      entrypoint: input.entrypoint,
      requestId: "req_scheduled_dependency_backup_runner",
      ...(input.actor ? { actor: input.actor } : {}),
    });
  }
}

class CapturingPolicyRepository
  implements Pick<DependencyResourceBackupPolicyRepository, "listRecords">
{
  readonly calls: Array<{
    context: RepositoryContext;
    filter?: Parameters<DependencyResourceBackupPolicyRepository["listRecords"]>[1];
  }> = [];

  constructor(private readonly result: Result<DependencyResourceBackupPolicyRecord[]>) {}

  async listRecords(
    context: RepositoryContext,
    filter?: Parameters<DependencyResourceBackupPolicyRepository["listRecords"]>[1],
  ): Promise<Result<DependencyResourceBackupPolicyRecord[]>> {
    this.calls.push({ context, ...(filter ? { filter } : {}) });
    return this.result;
  }
}

class CapturingScheduledDependencyBackupService
  implements Pick<ScheduledDependencyBackupService, "run">
{
  readonly calls: Array<{
    context: ExecutionContext;
    input: Parameters<ScheduledDependencyBackupService["run"]>[1];
  }> = [];

  async run(
    context: ExecutionContext,
    input: Parameters<ScheduledDependencyBackupService["run"]>[1],
  ): ReturnType<ScheduledDependencyBackupService["run"]> {
    this.calls.push({ context, input });
    return ok({
      schemaVersion: "dependency-resource-backup-policies.run/v1",
      processAttemptId: "wrk_scheduled_dependency_backup",
      policyId: input.policy.id,
      dependencyResourceId: input.policy.dependencyResourceId,
      backupId: "drb_scheduled",
      nextRunAt: "2026-01-15T06:00:00.000Z",
    } satisfies ScheduledDependencyBackupRunResult);
  }
}

function policy(overrides: Partial<DependencyResourceBackupPolicyRecord> = {}) {
  return {
    id: "dbp_pg",
    version: "v1",
    dependencyResourceId: "rsi_pg",
    retentionDays: 14,
    scheduleIntervalHours: 6,
    providerKey: null,
    retryOnFailure: true,
    enabled: true,
    lastRunAt: null,
    nextRunAt: "2026-01-15T00:00:00.000Z",
    updatedAt: "2026-01-15T00:00:00.000Z",
    ...overrides,
  } satisfies DependencyResourceBackupPolicyRecord;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("ScheduledDependencyBackupRunner", () => {
  test("[DEP-RES-BACKUP-POLICY-003] does not start when disabled", async () => {
    const service = new CapturingScheduledDependencyBackupService();
    const runner = createScheduledDependencyBackupRunner({
      config: { enabled: false, intervalSeconds: 60, batchSize: 5 },
      policyRepository: new CapturingPolicyRepository(ok([policy()])),
      service,
      executionContextFactory: new FixedExecutionContextFactory(),
      logger: new CapturingLogger(),
    });

    runner.start();
    await sleep(5);
    runner.stop();

    expect(service.calls).toHaveLength(0);
  });

  test("[DEP-RES-BACKUP-POLICY-003] dispatches due policies through the application service", async () => {
    const repository = new CapturingPolicyRepository(ok([policy(), policy({ id: "dbp_redis" })]));
    const service = new CapturingScheduledDependencyBackupService();
    const logger = new CapturingLogger();
    const runner = createScheduledDependencyBackupRunner({
      config: { enabled: true, intervalSeconds: 60, batchSize: 1 },
      policyRepository: repository,
      service,
      executionContextFactory: new FixedExecutionContextFactory(),
      logger,
    });

    runner.start();
    await sleep(5);
    runner.stop();

    expect(repository.calls[0]).toMatchObject({
      filter: {
        enabledOnly: true,
      },
    });
    expect(service.calls).toHaveLength(1);
    expect(service.calls[0]).toMatchObject({
      context: {
        entrypoint: "system",
        actor: {
          kind: "system",
          id: "scheduled-dependency-backup-runner",
        },
      },
      input: {
        policy: {
          id: "dbp_pg",
          dependencyResourceId: "rsi_pg",
        },
      },
    });
    expect(logger.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "info",
          message: "scheduled_dependency_backup_runner.tick_completed",
          details: {
            scanned: 1,
            completed: 1,
            failed: 0,
          },
        }),
      ]),
    );
  });
});
