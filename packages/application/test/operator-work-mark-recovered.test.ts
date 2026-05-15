import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok, type Result } from "@appaloft/core";
import { FixedClock } from "@appaloft/testkit";

import { createExecutionContext, type RepositoryContext } from "../src/execution-context";
import { MarkOperatorWorkRecoveredCommand } from "../src/operations/operator-work/mark-operator-work-recovered.command";
import { MarkOperatorWorkRecoveredUseCase } from "../src/operations/operator-work/mark-operator-work-recovered.use-case";
import {
  type ProcessAttemptListFilter,
  type ProcessAttemptPruneInput,
  type ProcessAttemptPruneResult,
  type ProcessAttemptReadModel,
  type ProcessAttemptRecord,
  type ProcessAttemptRecoveryRecorder,
} from "../src/ports";

class MemoryProcessAttempts implements ProcessAttemptReadModel, ProcessAttemptRecoveryRecorder {
  readonly updates: ProcessAttemptRecord[] = [];

  constructor(private readonly attempts: ProcessAttemptRecord[]) {}

  async list(
    _context: RepositoryContext,
    filter?: ProcessAttemptListFilter,
  ): Promise<ProcessAttemptRecord[]> {
    return this.attempts.filter((attempt) => !filter?.status || attempt.status === filter.status);
  }

  async findOne(_context: RepositoryContext, id: string): Promise<ProcessAttemptRecord | null> {
    return this.attempts.find((attempt) => attempt.id === id) ?? null;
  }

  async markRecovered(
    _context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>> {
    this.updates.push(attempt);
    const index = this.attempts.findIndex((existing) => existing.id === attempt.id);
    if (index >= 0) {
      this.attempts[index] = attempt;
    }
    return ok(attempt);
  }

  async deadLetter(
    _context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>> {
    this.updates.push(attempt);
    return ok(attempt);
  }

  async cancel(
    _context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>> {
    this.updates.push(attempt);
    return ok(attempt);
  }

  async retry(
    _context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>> {
    this.updates.push(attempt);
    return ok(attempt);
  }

  async prune(
    _context: RepositoryContext,
    _input: ProcessAttemptPruneInput,
  ): Promise<Result<ProcessAttemptPruneResult>> {
    return ok({
      matchedCount: 0,
      prunedCount: 0,
      countsByStatus: {},
    });
  }
}

function failedAttempt(overrides: Partial<ProcessAttemptRecord> = {}): ProcessAttemptRecord {
  return {
    id: "wrk_failed",
    kind: "runtime-maintenance",
    status: "failed",
    operationKey: "runtime-maintenance.sweep",
    dedupeKey: "runtime-maintenance:sweep",
    correlationId: "corr_work",
    requestId: "req_work",
    phase: "runtime-maintenance",
    step: "sweep",
    projectId: "prj_demo",
    resourceId: "res_web",
    serverId: "srv_primary",
    startedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:05.000Z",
    finishedAt: "2026-01-01T00:00:05.000Z",
    errorCode: "runtime_maintenance_failed",
    errorCategory: "async-processing",
    retriable: true,
    nextEligibleAt: "2026-01-01T00:05:00.000Z",
    nextActions: ["retry", "manual-review"],
    safeDetails: {
      cleanupStage: "workspace-sweep",
    },
    ...overrides,
  };
}

describe("operator-work.mark-recovered", () => {
  test("[OP-WORK-MARK-RECOVERED-001] marks a failed durable process attempt recovered", async () => {
    const store = new MemoryProcessAttempts([failedAttempt()]);
    const useCase = new MarkOperatorWorkRecoveredUseCase(
      store,
      store,
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );
    const context = createExecutionContext({
      requestId: "req_mark_recovered_test",
      entrypoint: "system",
    });

    const result = await useCase.execute(context, {
      workId: "wrk_failed",
      reason: "fixed target permissions",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      workId: "wrk_failed",
      status: "succeeded",
      recoveredAt: "2026-01-01T00:10:00.000Z",
    });
    expect(store.updates).toHaveLength(1);
    expect(store.updates[0]).toEqual({
      id: "wrk_failed",
      kind: "runtime-maintenance",
      status: "succeeded",
      operationKey: "runtime-maintenance.sweep",
      dedupeKey: "runtime-maintenance:sweep",
      correlationId: "corr_work",
      requestId: "req_work",
      phase: "manual-recovery",
      step: "marked-recovered",
      projectId: "prj_demo",
      resourceId: "res_web",
      serverId: "srv_primary",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:10:00.000Z",
      finishedAt: "2026-01-01T00:10:00.000Z",
      retriable: false,
      nextActions: ["no-action"],
      safeDetails: {
        cleanupStage: "workspace-sweep",
        recovered: true,
        recoveredAt: "2026-01-01T00:10:00.000Z",
        recoveredReason: "fixed target permissions",
      },
    });
  });

  test("[OP-WORK-MARK-RECOVERED-001] accepts retry-scheduled and dead-lettered attempts", async () => {
    const store = new MemoryProcessAttempts([
      failedAttempt({ id: "wrk_retry", status: "retry-scheduled" }),
      failedAttempt({ id: "wrk_dead", status: "dead-lettered" }),
    ]);
    const useCase = new MarkOperatorWorkRecoveredUseCase(
      store,
      store,
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );
    const context = createExecutionContext({
      requestId: "req_mark_recovered_status_test",
      entrypoint: "system",
    });

    const retryResult = await useCase.execute(context, { workId: "wrk_retry" });
    const deadResult = await useCase.execute(context, { workId: "wrk_dead" });

    expect(retryResult.isOk()).toBe(true);
    expect(deadResult.isOk()).toBe(true);
    expect(store.updates.map((attempt) => attempt.id)).toEqual(["wrk_retry", "wrk_dead"]);
  });

  test("[OP-WORK-MARK-RECOVERED-001] [PROC-DELIVERY-008] marks scheduled-task durable work recovered as process state only", async () => {
    const store = new MemoryProcessAttempts([
      failedAttempt({
        id: "wrk_scheduled_task_failed",
        operationKey: "scheduled-tasks.run-now",
        dedupeKey: "scheduled-task-run:str_failed",
        phase: "scheduled-task-run",
        step: "runtime-execution",
        resourceId: "res_api",
        errorCode: "scheduled_task_run_failed",
        safeDetails: {
          runId: "str_failed",
          taskId: "tsk_daily",
          resourceId: "res_api",
        },
      }),
    ]);
    const useCase = new MarkOperatorWorkRecoveredUseCase(
      store,
      store,
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );
    const context = createExecutionContext({
      requestId: "req_mark_scheduled_task_recovered_test",
      entrypoint: "system",
    });

    const result = await useCase.execute(context, {
      workId: "wrk_scheduled_task_failed",
      reason: "operator verified scheduled task side effect manually",
    });

    expect(result.isOk()).toBe(true);
    expect(store.updates).toEqual([
      {
        id: "wrk_scheduled_task_failed",
        kind: "runtime-maintenance",
        status: "succeeded",
        operationKey: "scheduled-tasks.run-now",
        dedupeKey: "scheduled-task-run:str_failed",
        correlationId: "corr_work",
        requestId: "req_work",
        phase: "manual-recovery",
        step: "marked-recovered",
        projectId: "prj_demo",
        resourceId: "res_api",
        serverId: "srv_primary",
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:10:00.000Z",
        finishedAt: "2026-01-01T00:10:00.000Z",
        retriable: false,
        nextActions: ["no-action"],
        safeDetails: {
          runId: "str_failed",
          taskId: "tsk_daily",
          resourceId: "res_api",
          recovered: true,
          recoveredAt: "2026-01-01T00:10:00.000Z",
          recoveredReason: "operator verified scheduled task side effect manually",
        },
      },
    ]);
    expect(JSON.stringify(store.updates)).not.toContain("runtime-execution");
    expect(JSON.stringify(store.updates)).not.toContain("scheduled_task_run_failed");
  });

  test("[OP-WORK-MARK-RECOVERED-001] [RT-CAP-SCHED-005] marks scheduled runtime prune work recovered as process state only", async () => {
    const store = new MemoryProcessAttempts([
      failedAttempt({
        id: "wrk_scheduled_prune_dead",
        status: "dead-lettered",
        operationKey: "servers.capacity.prune",
        dedupeKey: "scheduled-runtime-prune:rpp_project:srv_primary:2026-01-15T00:00:00.000Z",
        phase: "manual-dead-letter",
        step: "dead-lettered",
        retriable: false,
        nextActions: ["manual-review"],
        safeDetails: {
          policyId: "rpp_project",
          policyScope: "project",
          serverId: "srv_primary",
          before: "2026-01-12T00:00:00.000Z",
          dryRun: false,
          categoryCount: 2,
          deadLettered: true,
          deadLetteredAt: "2026-01-15T00:10:00.000Z",
          deadLetterReason: "operator disabled the stale prune policy",
        },
      }),
    ]);
    const useCase = new MarkOperatorWorkRecoveredUseCase(
      store,
      store,
      new FixedClock("2026-01-15T00:20:00.000Z"),
    );
    const context = createExecutionContext({
      requestId: "req_mark_scheduled_prune_recovered_test",
      entrypoint: "system",
    });

    const result = await useCase.execute(context, {
      workId: "wrk_scheduled_prune_dead",
      reason: "operator manually removed stale runtime artifacts",
    });

    expect(result.isOk()).toBe(true);
    expect(store.updates).toEqual([
      {
        id: "wrk_scheduled_prune_dead",
        kind: "runtime-maintenance",
        status: "succeeded",
        operationKey: "servers.capacity.prune",
        dedupeKey: "scheduled-runtime-prune:rpp_project:srv_primary:2026-01-15T00:00:00.000Z",
        correlationId: "corr_work",
        requestId: "req_work",
        phase: "manual-recovery",
        step: "marked-recovered",
        projectId: "prj_demo",
        resourceId: "res_web",
        serverId: "srv_primary",
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-15T00:20:00.000Z",
        finishedAt: "2026-01-15T00:20:00.000Z",
        retriable: false,
        nextActions: ["no-action"],
        safeDetails: {
          policyId: "rpp_project",
          policyScope: "project",
          serverId: "srv_primary",
          before: "2026-01-12T00:00:00.000Z",
          dryRun: false,
          categoryCount: 2,
          deadLettered: true,
          deadLetteredAt: "2026-01-15T00:10:00.000Z",
          deadLetterReason: "operator disabled the stale prune policy",
          recovered: true,
          recoveredAt: "2026-01-15T00:20:00.000Z",
          recoveredReason: "operator manually removed stale runtime artifacts",
        },
      },
    ]);
    expect(JSON.stringify(store.updates)).not.toContain("prunedCount");
    expect(JSON.stringify(store.updates)).not.toContain("reclaimedBytes");
  });

  test("[OP-WORK-MARK-RECOVERED-002] rejects non-recoverable statuses", async () => {
    const store = new MemoryProcessAttempts([failedAttempt({ status: "running" })]);
    const useCase = new MarkOperatorWorkRecoveredUseCase(
      store,
      store,
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );
    const context = createExecutionContext({
      requestId: "req_mark_recovered_blocked_test",
      entrypoint: "system",
    });

    const result = await useCase.execute(context, { workId: "wrk_failed" });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("operator_work_recovery_not_allowed");
    expect(store.updates).toHaveLength(0);
  });

  test("[OP-WORK-MARK-RECOVERED-003] rejects missing durable rows", async () => {
    const store = new MemoryProcessAttempts([]);
    const useCase = new MarkOperatorWorkRecoveredUseCase(
      store,
      store,
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );
    const context = createExecutionContext({
      requestId: "req_mark_recovered_missing_test",
      entrypoint: "system",
    });

    const result = await useCase.execute(context, { workId: "wrk_missing" });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("operator_work_not_found");
    expect(store.updates).toHaveLength(0);
  });

  test("command schema trims optional reason", () => {
    const result = MarkOperatorWorkRecoveredCommand.create({
      workId: " wrk_failed ",
      reason: " fixed ",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      workId: "wrk_failed",
      reason: "fixed",
    });
  });
});
