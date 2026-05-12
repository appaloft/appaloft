import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok, type Result } from "@appaloft/core";
import { FixedClock } from "@appaloft/testkit";

import { createExecutionContext, type RepositoryContext } from "../src/execution-context";
import { PruneDomainEventsCommand } from "../src/operations/domain-events/prune-domain-events.command";
import { PruneDomainEventsUseCase } from "../src/operations/domain-events/prune-domain-events.use-case";
import {
  type DomainEventStreamPruneInput,
  type DomainEventStreamPruneStoreResult,
  type DomainEventStreamRetentionStore,
} from "../src/ports";

interface DomainEventStreamRow {
  id: string;
  eventType: string;
  aggregateId: string;
  aggregateType: string;
  deploymentId?: string;
  occurredAt: string;
  guardReason?: string;
}

class MemoryDomainEventStreamRetentionStore implements DomainEventStreamRetentionStore {
  readonly inputs: DomainEventStreamPruneInput[] = [];

  constructor(private readonly rows: DomainEventStreamRow[]) {}

  list(): DomainEventStreamRow[] {
    return [...this.rows];
  }

  async prune(
    _context: RepositoryContext,
    input: DomainEventStreamPruneInput,
  ): Promise<Result<DomainEventStreamPruneStoreResult>> {
    this.inputs.push(input);
    const inspected = this.rows.filter(
      (row) =>
        row.occurredAt < input.before &&
        (!input.eventType || row.eventType === input.eventType) &&
        (!input.aggregateId || row.aggregateId === input.aggregateId) &&
        (!input.aggregateType || row.aggregateType === input.aggregateType) &&
        (!input.deploymentId || row.deploymentId === input.deploymentId),
    );
    const candidates = inspected.filter((row) => !row.guardReason);
    const skipped = inspected.filter((row) => row.guardReason);
    const countsByEventType: Record<string, number> = {};
    const skippedCountsByReason: Record<string, number> = {};

    for (const row of candidates) {
      countsByEventType[row.eventType] = (countsByEventType[row.eventType] ?? 0) + 1;
    }

    for (const row of skipped) {
      const reason = row.guardReason ?? "unknown";
      skippedCountsByReason[reason] = (skippedCountsByReason[reason] ?? 0) + 1;
    }

    if (!input.dryRun) {
      for (const row of candidates) {
        const index = this.rows.findIndex((candidate) => candidate.id === row.id);
        if (index >= 0) {
          this.rows.splice(index, 1);
        }
      }
    }

    return ok({
      inspectedCount: inspected.length,
      candidateCount: candidates.length,
      prunedCount: input.dryRun ? 0 : candidates.length,
      skippedCount: skipped.length,
      countsByEventType,
      skippedCountsByReason,
    });
  }
}

function eventStreamRow(overrides: Partial<DomainEventStreamRow> = {}): DomainEventStreamRow {
  return {
    id: "des_primary",
    eventType: "deployment.finished",
    aggregateId: "dep_primary",
    aggregateType: "deployment",
    deploymentId: "dep_primary",
    occurredAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("domain-events.prune", () => {
  test("[DOMAIN-EVENT-RETENTION-001] defaults to dry-run and deletes no retained event stream rows", async () => {
    const store = new MemoryDomainEventStreamRetentionStore([
      eventStreamRow({ id: "des_old" }),
      eventStreamRow({ id: "des_other_type", eventType: "deployment.started" }),
      eventStreamRow({ id: "des_cutoff_equal", occurredAt: "2026-01-01T00:05:00.000Z" }),
    ]);
    const useCase = new PruneDomainEventsUseCase(store, new FixedClock("2026-01-01T00:10:00.000Z"));
    const context = createExecutionContext({
      requestId: "req_domain_event_prune_dry_run_test",
      entrypoint: "system",
    });
    const command = PruneDomainEventsCommand.create({
      before: "2026-01-01T00:05:00.000Z",
    })._unsafeUnwrap();

    const result = await useCase.execute(context, command);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      schemaVersion: "domain-events.prune/v1",
      before: "2026-01-01T00:05:00.000Z",
      dryRun: true,
      inspectedCount: 2,
      candidateCount: 2,
      prunedCount: 0,
      skippedCount: 0,
      countsByEventType: {
        "deployment.finished": 1,
        "deployment.started": 1,
      },
      skippedCountsByReason: {},
      prunedAt: "2026-01-01T00:10:00.000Z",
    });
    expect(store.inputs).toEqual([
      {
        before: "2026-01-01T00:05:00.000Z",
        dryRun: true,
      },
    ]);
    expect(store.list()).toHaveLength(3);
  });

  test("[DOMAIN-EVENT-RETENTION-002] destructive prune deletes only old eligible retained rows", async () => {
    const store = new MemoryDomainEventStreamRetentionStore([
      eventStreamRow({ id: "des_match" }),
      eventStreamRow({ id: "des_other_type", eventType: "deployment.started" }),
      eventStreamRow({ id: "des_other_aggregate", aggregateId: "dep_other" }),
    ]);
    const useCase = new PruneDomainEventsUseCase(store, new FixedClock("2026-01-01T00:10:00.000Z"));
    const context = createExecutionContext({
      requestId: "req_domain_event_prune_delete_test",
      entrypoint: "system",
    });
    const command = PruneDomainEventsCommand.create({
      before: "2026-01-01T00:05:00.000Z",
      eventType: "deployment.finished",
      aggregateId: "dep_primary",
      dryRun: false,
    })._unsafeUnwrap();

    const result = await useCase.execute(context, command);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "domain-events.prune/v1",
      before: "2026-01-01T00:05:00.000Z",
      eventType: "deployment.finished",
      aggregateId: "dep_primary",
      dryRun: false,
      inspectedCount: 1,
      candidateCount: 1,
      prunedCount: 1,
      skippedCount: 0,
      countsByEventType: {
        "deployment.finished": 1,
      },
      skippedCountsByReason: {},
    });
    expect(store.list().map((row) => row.id)).toEqual(["des_other_type", "des_other_aggregate"]);
  });

  test("[DOMAIN-EVENT-RETENTION-003] reports cutoff, scope, and guard safety through skipped counts", async () => {
    const store = new MemoryDomainEventStreamRetentionStore([
      eventStreamRow({ id: "des_match" }),
      eventStreamRow({ id: "des_cutoff_equal", occurredAt: "2026-01-01T00:05:00.000Z" }),
      eventStreamRow({ id: "des_newer", occurredAt: "2026-01-01T00:06:00.000Z" }),
      eventStreamRow({ id: "des_other_deployment", deploymentId: "dep_other" }),
      eventStreamRow({ id: "des_recovery_guard", guardReason: "recovery-readiness" }),
      eventStreamRow({ id: "des_rollback_guard", guardReason: "rollback-candidate" }),
    ]);
    const useCase = new PruneDomainEventsUseCase(store, new FixedClock("2026-01-01T00:10:00.000Z"));
    const context = createExecutionContext({
      requestId: "req_domain_event_prune_guard_test",
      entrypoint: "system",
    });
    const command = PruneDomainEventsCommand.create({
      before: "2026-01-01T00:05:00.000Z",
      deploymentId: "dep_primary",
      dryRun: false,
    })._unsafeUnwrap();

    const result = await useCase.execute(context, command);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "domain-events.prune/v1",
      inspectedCount: 3,
      candidateCount: 1,
      prunedCount: 1,
      skippedCount: 2,
      countsByEventType: {
        "deployment.finished": 1,
      },
      skippedCountsByReason: {
        "recovery-readiness": 1,
        "rollback-candidate": 1,
      },
    });
    expect(store.list().map((row) => row.id)).toEqual([
      "des_cutoff_equal",
      "des_newer",
      "des_other_deployment",
      "des_recovery_guard",
      "des_rollback_guard",
    ]);
  });

  test("command schema normalizes optional filters and rejects malformed cutoffs", () => {
    const valid = PruneDomainEventsCommand.create({
      before: "2026-01-01T00:05:00.000Z",
      eventType: " deployment.finished ",
      aggregateId: " dep_primary ",
      aggregateType: " deployment ",
      deploymentId: " dep_primary ",
      limit: 50,
      dryRun: false,
    });
    const invalid = PruneDomainEventsCommand.create({
      before: "not-a-date",
    });

    expect(valid.isOk()).toBe(true);
    expect(valid._unsafeUnwrap()).toMatchObject({
      before: "2026-01-01T00:05:00.000Z",
      eventType: "deployment.finished",
      aggregateId: "dep_primary",
      aggregateType: "deployment",
      deploymentId: "dep_primary",
      limit: 50,
      dryRun: false,
    });
    expect(invalid.isErr()).toBe(true);
    expect(invalid._unsafeUnwrapErr().code).toBe("validation_error");
  });
});
