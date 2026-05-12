import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok, type Result } from "@appaloft/core";
import { FixedClock, SequenceIdGenerator } from "@appaloft/testkit";

import { createExecutionContext, type RepositoryContext } from "../src/execution-context";
import { RetryOperatorWorkCommand } from "../src/operations/operator-work/retry-operator-work.command";
import { RetryOperatorWorkUseCase } from "../src/operations/operator-work/retry-operator-work.use-case";
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
  readonly retries: ProcessAttemptRecord[] = [];

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
    return ok(attempt);
  }

  async retry(
    _context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>> {
    this.retries.push(attempt);
    this.attempts.push(attempt);
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

describe("operator-work.retry", () => {
  test("[OP-WORK-RETRY-001] creates a new pending retry attempt from failed work", async () => {
    const store = new MemoryProcessAttempts([failedAttempt()]);
    const useCase = new RetryOperatorWorkUseCase(
      store,
      store,
      new FixedClock("2026-01-01T00:10:00.000Z"),
      new SequenceIdGenerator(),
    );
    const context = createExecutionContext({
      requestId: "req_retry_test",
      entrypoint: "system",
    });

    const result = await useCase.execute(context, {
      workId: "wrk_failed",
      reason: "operator confirmed dependency is healthy",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      workId: "wrk_0001",
      status: "pending",
      retryOfWorkId: "wrk_failed",
      retriedAt: "2026-01-01T00:10:00.000Z",
    });
    expect(store.retries).toEqual([
      {
        id: "wrk_0001",
        kind: "runtime-maintenance",
        status: "pending",
        operationKey: "runtime-maintenance.sweep",
        dedupeKey: "runtime-maintenance:sweep:retry:wrk_0001",
        correlationId: "corr_work",
        requestId: "req_work",
        phase: "manual-retry",
        step: "queued",
        projectId: "prj_demo",
        resourceId: "res_web",
        serverId: "srv_primary",
        startedAt: "2026-01-01T00:10:00.000Z",
        updatedAt: "2026-01-01T00:10:00.000Z",
        retriable: false,
        nextActions: ["no-action"],
        safeDetails: {
          cleanupStage: "workspace-sweep",
          retryOfWorkId: "wrk_failed",
          retriedAt: "2026-01-01T00:10:00.000Z",
          retryOfDedupeKey: "runtime-maintenance:sweep",
          retryReason: "operator confirmed dependency is healthy",
        },
      },
    ]);
  });

  test("[OP-WORK-RETRY-001] accepts retry-scheduled attempts", async () => {
    const store = new MemoryProcessAttempts([
      failedAttempt({ id: "wrk_retry", status: "retry-scheduled" }),
    ]);
    const useCase = new RetryOperatorWorkUseCase(
      store,
      store,
      new FixedClock("2026-01-01T00:10:00.000Z"),
      new SequenceIdGenerator(),
    );
    const context = createExecutionContext({
      requestId: "req_retry_scheduled_test",
      entrypoint: "system",
    });

    const result = await useCase.execute(context, { workId: "wrk_retry" });

    expect(result.isOk()).toBe(true);
    expect(store.retries.map((attempt) => attempt.id)).toEqual(["wrk_0001"]);
    expect(store.retries[0]?.safeDetails).toMatchObject({
      retryOfWorkId: "wrk_retry",
    });
  });

  test("[OP-WORK-RETRY-001] [PROC-DELIVERY-006] creates only a pending annotation for scheduled-task durable work", async () => {
    const store = new MemoryProcessAttempts([
      failedAttempt({
        id: "wrk_scheduled_task_failed",
        status: "retry-scheduled",
        operationKey: "scheduled-task-runs.run-now",
        dedupeKey: "scheduled-task-run:str_failed",
        phase: "scheduled-task-run",
        step: "runtime-execution",
        resourceId: "res_api",
        errorCode: "scheduled_task_run_failed",
        nextEligibleAt: "2026-01-01T00:05:00.000Z",
        safeDetails: {
          runId: "str_failed",
          taskId: "tsk_daily",
          resourceId: "res_api",
        },
      }),
    ]);
    const useCase = new RetryOperatorWorkUseCase(
      store,
      store,
      new FixedClock("2026-01-01T00:10:00.000Z"),
      new SequenceIdGenerator(),
    );
    const context = createExecutionContext({
      requestId: "req_scheduled_task_retry_annotation_test",
      entrypoint: "system",
    });

    const result = await useCase.execute(context, {
      workId: "wrk_scheduled_task_failed",
      reason: "operator queued retry for scheduled task run",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      workId: "wrk_0001",
      status: "pending",
      retryOfWorkId: "wrk_scheduled_task_failed",
      retriedAt: "2026-01-01T00:10:00.000Z",
    });
    expect(store.updates).toHaveLength(0);
    expect(store.retries).toEqual([
      {
        id: "wrk_0001",
        kind: "runtime-maintenance",
        status: "pending",
        operationKey: "scheduled-task-runs.run-now",
        dedupeKey: "scheduled-task-run:str_failed:retry:wrk_0001",
        correlationId: "corr_work",
        requestId: "req_work",
        phase: "manual-retry",
        step: "queued",
        projectId: "prj_demo",
        resourceId: "res_api",
        serverId: "srv_primary",
        startedAt: "2026-01-01T00:10:00.000Z",
        updatedAt: "2026-01-01T00:10:00.000Z",
        retriable: false,
        nextActions: ["no-action"],
        safeDetails: {
          runId: "str_failed",
          taskId: "tsk_daily",
          resourceId: "res_api",
          retryOfWorkId: "wrk_scheduled_task_failed",
          retriedAt: "2026-01-01T00:10:00.000Z",
          retryOfDedupeKey: "scheduled-task-run:str_failed",
          retryReason: "operator queued retry for scheduled task run",
        },
      },
    ]);
    expect(JSON.stringify(store.retries)).not.toContain("runtime-execution");
    expect(JSON.stringify(store.retries)).not.toContain("scheduled_task_run_failed");
  });

  test("[OP-WORK-RETRY-002] rejects non-retryable statuses and metadata", async () => {
    const blockedAttempts: Array<Partial<ProcessAttemptRecord> & { status: ProcessAttemptStatus }> =
      [
        { status: "pending", retriable: true },
        { status: "running", retriable: true },
        { status: "succeeded", retriable: true },
        { status: "canceled", retriable: true },
        { status: "dead-lettered", retriable: true },
        { status: "unknown", retriable: true },
        { status: "failed", retriable: false },
        { status: "retry-scheduled", retriable: false },
      ];

    for (const attempt of blockedAttempts) {
      const store = new MemoryProcessAttempts([
        failedAttempt({
          id: `wrk_${attempt.status}_${String(attempt.retriable)}`,
          ...attempt,
        }),
      ]);
      const useCase = new RetryOperatorWorkUseCase(
        store,
        store,
        new FixedClock("2026-01-01T00:10:00.000Z"),
        new SequenceIdGenerator(),
      );
      const context = createExecutionContext({
        requestId: `req_retry_blocked_${attempt.status}_${String(attempt.retriable)}_test`,
        entrypoint: "system",
      });

      const result = await useCase.execute(context, {
        workId: `wrk_${attempt.status}_${String(attempt.retriable)}`,
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe("operator_work_retry_not_allowed");
      expect(store.retries).toHaveLength(0);
    }
  });

  test("[OP-WORK-RETRY-003] rejects missing durable rows", async () => {
    const store = new MemoryProcessAttempts([]);
    const useCase = new RetryOperatorWorkUseCase(
      store,
      store,
      new FixedClock("2026-01-01T00:10:00.000Z"),
      new SequenceIdGenerator(),
    );
    const context = createExecutionContext({
      requestId: "req_retry_missing_test",
      entrypoint: "system",
    });

    const result = await useCase.execute(context, { workId: "wrk_missing" });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("operator_work_not_found");
    expect(store.retries).toHaveLength(0);
  });

  test("command schema trims optional reason", () => {
    const result = RetryOperatorWorkCommand.create({
      workId: " wrk_failed ",
      reason: " retry after dependency repair ",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      workId: "wrk_failed",
      reason: "retry after dependency repair",
    });
  });
});
