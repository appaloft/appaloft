import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok, type Result } from "@appaloft/core";
import { FixedClock } from "@appaloft/testkit";

import { createExecutionContext, type RepositoryContext } from "../src/execution-context";
import { PruneOperatorWorkCommand } from "../src/operations/operator-work/prune-operator-work.command";
import { PruneOperatorWorkUseCase } from "../src/operations/operator-work/prune-operator-work.use-case";
import {
  type ProcessAttemptListFilter,
  type ProcessAttemptPruneInput,
  type ProcessAttemptPruneResult,
  type ProcessAttemptReadModel,
  type ProcessAttemptRecord,
  type ProcessAttemptRecoveryRecorder,
  type PrunableProcessAttemptStatus,
  prunableProcessAttemptStatuses,
} from "../src/ports";

function isPrunableStatus(status: string): status is PrunableProcessAttemptStatus {
  return prunableProcessAttemptStatuses.includes(status as PrunableProcessAttemptStatus);
}

class MemoryProcessAttempts implements ProcessAttemptReadModel, ProcessAttemptRecoveryRecorder {
  readonly pruneInputs: ProcessAttemptPruneInput[] = [];

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
    return ok(attempt);
  }

  async deadLetter(
    _context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>> {
    return ok(attempt);
  }

  async cancel(
    _context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>> {
    return ok(attempt);
  }

  async retry(
    _context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>> {
    return ok(attempt);
  }

  async prune(
    _context: RepositoryContext,
    input: ProcessAttemptPruneInput,
  ): Promise<Result<ProcessAttemptPruneResult>> {
    this.pruneInputs.push(input);
    const matched = this.attempts.filter(
      (attempt) =>
        isPrunableStatus(attempt.status) &&
        input.statuses.includes(attempt.status) &&
        attempt.updatedAt < input.before,
    );
    const countsByStatus: ProcessAttemptPruneResult["countsByStatus"] = {};

    for (const attempt of matched) {
      if (isPrunableStatus(attempt.status)) {
        countsByStatus[attempt.status] = (countsByStatus[attempt.status] ?? 0) + 1;
      }
    }

    if (!input.dryRun) {
      for (const attempt of matched) {
        const index = this.attempts.findIndex((candidate) => candidate.id === attempt.id);
        if (index >= 0) {
          this.attempts.splice(index, 1);
        }
      }
    }

    return ok({
      matchedCount: matched.length,
      prunedCount: input.dryRun ? 0 : matched.length,
      countsByStatus,
    });
  }
}

function processAttempt(overrides: Partial<ProcessAttemptRecord> = {}): ProcessAttemptRecord {
  return {
    id: "wrk_attempt",
    kind: "runtime-maintenance",
    status: "succeeded",
    operationKey: "runtime-maintenance.sweep",
    updatedAt: "2026-01-01T00:00:00.000Z",
    nextActions: ["no-action"],
    ...overrides,
  };
}

describe("operator-work.prune", () => {
  test("[OP-WORK-PRUNE-001] dry-runs old terminal durable attempts by default", async () => {
    const store = new MemoryProcessAttempts([
      processAttempt({ id: "wrk_succeeded", status: "succeeded" }),
      processAttempt({ id: "wrk_failed", status: "failed" }),
      processAttempt({ id: "wrk_running", status: "running" }),
    ]);
    const useCase = new PruneOperatorWorkUseCase(store, new FixedClock("2026-01-01T00:10:00.000Z"));
    const context = createExecutionContext({
      requestId: "req_prune_dry_run_test",
      entrypoint: "system",
    });

    const result = await useCase.execute(context, {
      before: "2026-01-01T00:05:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      prunedCount: 0,
      matchedCount: 2,
      dryRun: true,
      before: "2026-01-01T00:05:00.000Z",
      statuses: ["succeeded", "failed", "canceled", "dead-lettered"],
      countsByStatus: {
        succeeded: 1,
        failed: 1,
      },
      prunedAt: "2026-01-01T00:10:00.000Z",
    });
    expect(store.pruneInputs).toEqual([
      {
        before: "2026-01-01T00:05:00.000Z",
        statuses: ["succeeded", "failed", "canceled", "dead-lettered"],
        dryRun: true,
      },
    ]);
    expect(await store.list({} as RepositoryContext)).toHaveLength(3);
  });

  test("[OP-WORK-PRUNE-002] destructive prune deletes only selected old terminal attempts", async () => {
    const store = new MemoryProcessAttempts([
      processAttempt({ id: "wrk_failed", status: "failed" }),
      processAttempt({ id: "wrk_canceled", status: "canceled" }),
      processAttempt({ id: "wrk_succeeded", status: "succeeded" }),
    ]);
    const useCase = new PruneOperatorWorkUseCase(store, new FixedClock("2026-01-01T00:10:00.000Z"));
    const context = createExecutionContext({
      requestId: "req_prune_delete_test",
      entrypoint: "system",
    });

    const result = await useCase.execute(context, {
      before: "2026-01-01T00:05:00.000Z",
      statuses: ["failed", "canceled"],
      dryRun: false,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      prunedCount: 2,
      matchedCount: 2,
      dryRun: false,
      countsByStatus: {
        failed: 1,
        canceled: 1,
      },
    });
    expect((await store.list({} as RepositoryContext)).map((attempt) => attempt.id)).toEqual([
      "wrk_succeeded",
    ]);
  });

  test("[OP-WORK-PRUNE-003] retains non-prunable and cutoff-equal rows", async () => {
    const store = new MemoryProcessAttempts([
      processAttempt({ id: "wrk_pending", status: "pending" }),
      processAttempt({ id: "wrk_running", status: "running" }),
      processAttempt({ id: "wrk_retry", status: "retry-scheduled" }),
      processAttempt({ id: "wrk_unknown", status: "unknown" }),
      processAttempt({
        id: "wrk_cutoff_equal",
        status: "failed",
        updatedAt: "2026-01-01T00:05:00.000Z",
      }),
    ]);
    const useCase = new PruneOperatorWorkUseCase(store, new FixedClock("2026-01-01T00:10:00.000Z"));
    const context = createExecutionContext({
      requestId: "req_prune_retain_test",
      entrypoint: "system",
    });

    const result = await useCase.execute(context, {
      before: "2026-01-01T00:05:00.000Z",
      dryRun: false,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      prunedCount: 0,
      matchedCount: 0,
    });
    expect((await store.list({} as RepositoryContext)).map((attempt) => attempt.id)).toEqual([
      "wrk_pending",
      "wrk_running",
      "wrk_retry",
      "wrk_unknown",
      "wrk_cutoff_equal",
    ]);
  });

  test("command schema normalizes dry-run input and rejects non-datetime cutoffs", () => {
    const valid = PruneOperatorWorkCommand.create({
      before: "2026-01-01T00:05:00.000Z",
      statuses: ["failed"],
      dryRun: false,
    });
    const invalid = PruneOperatorWorkCommand.create({
      before: "not-a-date",
    });

    expect(valid.isOk()).toBe(true);
    expect(valid._unsafeUnwrap()).toMatchObject({
      before: "2026-01-01T00:05:00.000Z",
      statuses: ["failed"],
      dryRun: false,
    });
    expect(invalid.isErr()).toBe(true);
    expect(invalid._unsafeUnwrapErr().code).toBe("validation_error");
  });
});
