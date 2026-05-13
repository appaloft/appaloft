import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok, type Result } from "@appaloft/core";
import { FixedClock } from "@appaloft/testkit";

import { createExecutionContext, type RepositoryContext } from "../src/execution-context";
import { CancelOperatorWorkCommand } from "../src/operations/operator-work/cancel-operator-work.command";
import { CancelOperatorWorkUseCase } from "../src/operations/operator-work/cancel-operator-work.use-case";
import {
  type ProcessAttemptListFilter,
  type ProcessAttemptPruneInput,
  type ProcessAttemptPruneResult,
  type ProcessAttemptReadModel,
  type ProcessAttemptRecord,
  type ProcessAttemptRecoveryRecorder,
  type ProcessAttemptStatus,
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
    const index = this.attempts.findIndex((existing) => existing.id === attempt.id);
    if (index >= 0) {
      this.attempts[index] = attempt;
    }
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

function workAttempt(overrides: Partial<ProcessAttemptRecord> = {}): ProcessAttemptRecord {
  return {
    id: "wrk_pending",
    kind: "runtime-maintenance",
    status: "pending",
    operationKey: "runtime-maintenance.sweep",
    dedupeKey: "runtime-maintenance:sweep",
    correlationId: "corr_work",
    requestId: "req_work",
    phase: "runtime-maintenance",
    step: "queued",
    projectId: "prj_demo",
    resourceId: "res_web",
    serverId: "srv_primary",
    startedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:05.000Z",
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

describe("operator-work.cancel", () => {
  test("[OP-WORK-CANCEL-001] cancels a pending durable process attempt", async () => {
    const store = new MemoryProcessAttempts([workAttempt()]);
    const useCase = new CancelOperatorWorkUseCase(
      store,
      store,
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );
    const context = createExecutionContext({
      requestId: "req_cancel_test",
      entrypoint: "system",
    });

    const result = await useCase.execute(context, {
      workId: "wrk_pending",
      reason: "operator no longer wants this queued maintenance work",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      workId: "wrk_pending",
      status: "canceled",
      canceledAt: "2026-01-01T00:10:00.000Z",
    });
    expect(store.updates).toHaveLength(1);
    expect(store.updates[0]).toEqual({
      id: "wrk_pending",
      kind: "runtime-maintenance",
      status: "canceled",
      operationKey: "runtime-maintenance.sweep",
      dedupeKey: "runtime-maintenance:sweep",
      correlationId: "corr_work",
      requestId: "req_work",
      phase: "manual-cancel",
      step: "canceled",
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
        canceled: true,
        canceledAt: "2026-01-01T00:10:00.000Z",
        cancelReason: "operator no longer wants this queued maintenance work",
      },
    });
  });

  test("[OP-WORK-CANCEL-001] accepts retry-scheduled attempts", async () => {
    const store = new MemoryProcessAttempts([
      workAttempt({ id: "wrk_retry", status: "retry-scheduled" }),
    ]);
    const useCase = new CancelOperatorWorkUseCase(
      store,
      store,
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );
    const context = createExecutionContext({
      requestId: "req_cancel_retry_test",
      entrypoint: "system",
    });

    const result = await useCase.execute(context, {
      workId: "wrk_retry",
      reason: "operator stopped the retry loop",
    });

    expect(result.isOk()).toBe(true);
    expect(store.updates.map((attempt) => attempt.id)).toEqual(["wrk_retry"]);
    expect(store.updates[0]?.status).toBe("canceled");
  });

  test("[OP-WORK-CANCEL-001] [PROC-DELIVERY-008] cancels scheduled-task durable work as process state only", async () => {
    const store = new MemoryProcessAttempts([
      workAttempt({
        id: "wrk_scheduled_task_retry",
        status: "retry-scheduled",
        operationKey: "scheduled-task-runs.run-now",
        dedupeKey: "scheduled-task-run:str_retry",
        phase: "scheduled-task-run",
        step: "runtime-execution",
        resourceId: "res_api",
        errorCode: "scheduled_task_run_failed",
        safeDetails: {
          runId: "str_retry",
          taskId: "tsk_daily",
          resourceId: "res_api",
        },
      }),
    ]);
    const useCase = new CancelOperatorWorkUseCase(
      store,
      store,
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );
    const context = createExecutionContext({
      requestId: "req_cancel_scheduled_task_test",
      entrypoint: "system",
    });

    const result = await useCase.execute(context, {
      workId: "wrk_scheduled_task_retry",
      reason: "operator stopped scheduled task retry",
    });

    expect(result.isOk()).toBe(true);
    expect(store.updates).toEqual([
      {
        id: "wrk_scheduled_task_retry",
        kind: "runtime-maintenance",
        status: "canceled",
        operationKey: "scheduled-task-runs.run-now",
        dedupeKey: "scheduled-task-run:str_retry",
        correlationId: "corr_work",
        requestId: "req_work",
        phase: "manual-cancel",
        step: "canceled",
        projectId: "prj_demo",
        resourceId: "res_api",
        serverId: "srv_primary",
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:10:00.000Z",
        finishedAt: "2026-01-01T00:10:00.000Z",
        retriable: false,
        nextActions: ["no-action"],
        safeDetails: {
          runId: "str_retry",
          taskId: "tsk_daily",
          resourceId: "res_api",
          canceled: true,
          canceledAt: "2026-01-01T00:10:00.000Z",
          cancelReason: "operator stopped scheduled task retry",
        },
      },
    ]);
    expect(JSON.stringify(store.updates)).not.toContain("runtime-execution");
    expect(JSON.stringify(store.updates)).not.toContain("scheduled_task_run_failed");
  });

  test("[OP-WORK-CANCEL-002] rejects non-cancelable statuses", async () => {
    const nonCancelableStatuses: ProcessAttemptStatus[] = [
      "running",
      "succeeded",
      "failed",
      "canceled",
      "dead-lettered",
      "unknown",
    ];

    for (const status of nonCancelableStatuses) {
      const store = new MemoryProcessAttempts([workAttempt({ id: `wrk_${status}`, status })]);
      const useCase = new CancelOperatorWorkUseCase(
        store,
        store,
        new FixedClock("2026-01-01T00:10:00.000Z"),
      );
      const context = createExecutionContext({
        requestId: `req_cancel_blocked_${status}_test`,
        entrypoint: "system",
      });

      const result = await useCase.execute(context, {
        workId: `wrk_${status}`,
        reason: "operator cancellation",
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe("operator_work_cancel_not_allowed");
      expect(store.updates).toHaveLength(0);
    }
  });

  test("[OP-WORK-CANCEL-003] rejects missing durable rows", async () => {
    const store = new MemoryProcessAttempts([]);
    const useCase = new CancelOperatorWorkUseCase(
      store,
      store,
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );
    const context = createExecutionContext({
      requestId: "req_cancel_missing_test",
      entrypoint: "system",
    });

    const result = await useCase.execute(context, {
      workId: "wrk_missing",
      reason: "operator cancellation",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("operator_work_not_found");
    expect(store.updates).toHaveLength(0);
  });

  test("command schema requires and trims reason", () => {
    const valid = CancelOperatorWorkCommand.create({
      workId: " wrk_pending ",
      reason: " operator cancellation ",
    });
    const invalid = CancelOperatorWorkCommand.create({
      workId: "wrk_pending",
      reason: " ",
    });

    expect(valid.isOk()).toBe(true);
    expect(valid._unsafeUnwrap()).toMatchObject({
      workId: "wrk_pending",
      reason: "operator cancellation",
    });
    expect(invalid.isErr()).toBe(true);
  });
});
