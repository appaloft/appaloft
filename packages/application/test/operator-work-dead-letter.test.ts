import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok, type Result } from "@appaloft/core";
import { FixedClock } from "@appaloft/testkit";

import { createExecutionContext, type RepositoryContext } from "../src/execution-context";
import { DeadLetterOperatorWorkCommand } from "../src/operations/operator-work/dead-letter-operator-work.command";
import { DeadLetterOperatorWorkUseCase } from "../src/operations/operator-work/dead-letter-operator-work.use-case";
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
    return ok(attempt);
  }

  async deadLetter(
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

describe("operator-work.dead-letter", () => {
  test("[OP-WORK-DEAD-LETTER-001] dead-letters a failed durable process attempt", async () => {
    const store = new MemoryProcessAttempts([failedAttempt()]);
    const useCase = new DeadLetterOperatorWorkUseCase(
      store,
      store,
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );
    const context = createExecutionContext({
      requestId: "req_dead_letter_test",
      entrypoint: "system",
    });

    const result = await useCase.execute(context, {
      workId: "wrk_failed",
      reason: "external dependency requires vendor support",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      workId: "wrk_failed",
      status: "dead-lettered",
      deadLetteredAt: "2026-01-01T00:10:00.000Z",
    });
    expect(store.updates).toHaveLength(1);
    expect(store.updates[0]).toEqual({
      id: "wrk_failed",
      kind: "runtime-maintenance",
      status: "dead-lettered",
      operationKey: "runtime-maintenance.sweep",
      dedupeKey: "runtime-maintenance:sweep",
      correlationId: "corr_work",
      requestId: "req_work",
      phase: "manual-dead-letter",
      step: "dead-lettered",
      projectId: "prj_demo",
      resourceId: "res_web",
      serverId: "srv_primary",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:10:00.000Z",
      finishedAt: "2026-01-01T00:10:00.000Z",
      retriable: false,
      nextActions: ["manual-review"],
      safeDetails: {
        cleanupStage: "workspace-sweep",
        deadLettered: true,
        deadLetteredAt: "2026-01-01T00:10:00.000Z",
        deadLetterReason: "external dependency requires vendor support",
      },
    });
  });

  test("[OP-WORK-DEAD-LETTER-001] accepts retry-scheduled attempts", async () => {
    const store = new MemoryProcessAttempts([
      failedAttempt({ id: "wrk_retry", status: "retry-scheduled" }),
    ]);
    const useCase = new DeadLetterOperatorWorkUseCase(
      store,
      store,
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );
    const context = createExecutionContext({
      requestId: "req_dead_letter_retry_test",
      entrypoint: "system",
    });

    const result = await useCase.execute(context, {
      workId: "wrk_retry",
      reason: "retry loop exceeded manual threshold",
    });

    expect(result.isOk()).toBe(true);
    expect(store.updates.map((attempt) => attempt.id)).toEqual(["wrk_retry"]);
  });

  test("[OP-WORK-DEAD-LETTER-001] [RT-CAP-SCHED-005] dead-letters retry-scheduled scheduled runtime prune work", async () => {
    const store = new MemoryProcessAttempts([
      failedAttempt({
        id: "wrk_scheduled_prune_retry",
        status: "retry-scheduled",
        operationKey: "servers.capacity.prune",
        dedupeKey: "scheduled-runtime-prune:rpp_project:srv_primary:2026-01-15T00:00:00.000Z",
        phase: "scheduled-runtime-prune",
        step: "prune-command-dispatch",
        errorCode: "infra_error",
        errorCategory: "infra",
        safeDetails: {
          policyId: "rpp_project",
          policyScope: "project",
          serverId: "srv_primary",
          before: "2026-01-12T00:00:00.000Z",
          dryRun: false,
          categoryCount: 2,
        },
      }),
    ]);
    const useCase = new DeadLetterOperatorWorkUseCase(
      store,
      store,
      new FixedClock("2026-01-15T00:10:00.000Z"),
    );
    const context = createExecutionContext({
      requestId: "req_dead_letter_scheduled_prune_test",
      entrypoint: "system",
    });

    const result = await useCase.execute(context, {
      workId: "wrk_scheduled_prune_retry",
      reason: "operator disabled the stale prune policy",
    });

    expect(result.isOk()).toBe(true);
    expect(store.updates).toEqual([
      {
        id: "wrk_scheduled_prune_retry",
        kind: "runtime-maintenance",
        status: "dead-lettered",
        operationKey: "servers.capacity.prune",
        dedupeKey: "scheduled-runtime-prune:rpp_project:srv_primary:2026-01-15T00:00:00.000Z",
        correlationId: "corr_work",
        requestId: "req_work",
        phase: "manual-dead-letter",
        step: "dead-lettered",
        projectId: "prj_demo",
        resourceId: "res_web",
        serverId: "srv_primary",
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-15T00:10:00.000Z",
        finishedAt: "2026-01-15T00:10:00.000Z",
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
      },
    ]);
  });

  test("[OP-WORK-DEAD-LETTER-002] rejects non-dead-letterable statuses", async () => {
    const store = new MemoryProcessAttempts([failedAttempt({ status: "running" })]);
    const useCase = new DeadLetterOperatorWorkUseCase(
      store,
      store,
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );
    const context = createExecutionContext({
      requestId: "req_dead_letter_blocked_test",
      entrypoint: "system",
    });

    const result = await useCase.execute(context, {
      workId: "wrk_failed",
      reason: "manual review",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("operator_work_dead_letter_not_allowed");
    expect(store.updates).toHaveLength(0);
  });

  test("[OP-WORK-DEAD-LETTER-003] rejects missing durable rows", async () => {
    const store = new MemoryProcessAttempts([]);
    const useCase = new DeadLetterOperatorWorkUseCase(
      store,
      store,
      new FixedClock("2026-01-01T00:10:00.000Z"),
    );
    const context = createExecutionContext({
      requestId: "req_dead_letter_missing_test",
      entrypoint: "system",
    });

    const result = await useCase.execute(context, {
      workId: "wrk_missing",
      reason: "manual review",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("operator_work_not_found");
    expect(store.updates).toHaveLength(0);
  });

  test("command schema requires and trims reason", () => {
    const valid = DeadLetterOperatorWorkCommand.create({
      workId: " wrk_failed ",
      reason: " manual review ",
    });
    const invalid = DeadLetterOperatorWorkCommand.create({
      workId: "wrk_failed",
      reason: " ",
    });

    expect(valid.isOk()).toBe(true);
    expect(valid._unsafeUnwrap()).toMatchObject({
      workId: "wrk_failed",
      reason: "manual review",
    });
    expect(invalid.isErr()).toBe(true);
  });
});
