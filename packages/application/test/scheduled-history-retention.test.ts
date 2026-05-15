import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { FixedClock, SequenceIdGenerator as TestSequenceIdGenerator } from "@appaloft/testkit";

import { type Command, type CommandBus } from "../src/cqrs";
import {
  createExecutionContext,
  type ExecutionContext,
  type RepositoryContext,
} from "../src/execution-context";
import { PruneAuditEventsCommand } from "../src/operations/audit-events/prune-audit-events.command";
import { PruneDomainEventsCommand } from "../src/operations/domain-events/prune-domain-events.command";
import {
  type RetentionDefaultCategory,
  type RetentionDefaultListFilter,
  type RetentionDefaultRecord,
  type RetentionDefaultRepository,
} from "../src/operations/retention-defaults/retention-defaults.service";
import { ScheduledHistoryRetentionService } from "../src/operations/retention-defaults/scheduled-history-retention.service";
import {
  type ProcessAttemptClaimer,
  type ProcessAttemptClaimInput,
  type ProcessAttemptClaimResult,
  type ProcessAttemptCompleter,
  type ProcessAttemptCompletionInput,
  type ProcessAttemptCompletionResult,
  type ProcessAttemptRecord,
  type ProcessAttemptRecorder,
  type RuntimeMonitoringSamplePruneInput,
  type RuntimeMonitoringSamplePruneStoreResult,
  type RuntimeMonitoringSampleRetentionStore,
} from "../src/ports";

class RecordingCommandBus implements Pick<CommandBus, "execute"> {
  readonly commands: Command<unknown>[] = [];

  constructor(private readonly result: Result<unknown> = ok({ matchedCount: 1, prunedCount: 0 })) {}

  async execute<TResult>(
    _context: ExecutionContext,
    command: Command<TResult>,
  ): Promise<Result<TResult>> {
    this.commands.push(command as Command<unknown>);
    return this.result as Result<TResult>;
  }
}

class MemoryRetentionDefaultRepository implements RetentionDefaultRepository {
  readonly items = new Map<string, RetentionDefaultRecord>();

  async findOne(): Promise<Result<RetentionDefaultRecord | null>> {
    return ok(null);
  }

  async list(
    _context: RepositoryContext,
    filter: RetentionDefaultListFilter = {},
  ): Promise<Result<RetentionDefaultRecord[]>> {
    return ok(
      Array.from(this.items.values()).filter((record) => {
        const matchesScope = filter.scope ? record.scope === filter.scope : true;
        const matchesOrganization =
          filter.organizationId !== undefined
            ? record.organizationId === filter.organizationId
            : true;
        const matchesCategory = filter.category ? record.category === filter.category : true;
        const matchesEnabled = filter.enabledOnly === true ? record.enabled : true;
        return matchesScope && matchesOrganization && matchesCategory && matchesEnabled;
      }),
    );
  }

  async upsert(
    _context: RepositoryContext,
    record: RetentionDefaultRecord,
  ): Promise<Result<RetentionDefaultRecord>> {
    this.items.set(record.id, record);
    return ok(record);
  }
}

class MemoryProcessAttemptRecorder implements ProcessAttemptRecorder {
  readonly attempts: ProcessAttemptRecord[] = [];

  async record(
    _context: RepositoryContext,
    attempt: ProcessAttemptRecord,
  ): Promise<Result<ProcessAttemptRecord>> {
    this.attempts.push(attempt);
    return ok(attempt);
  }
}

class RecordingProcessAttemptClaimer implements ProcessAttemptClaimer {
  readonly claims: ProcessAttemptClaimInput[] = [];

  async claimDue(
    _context: RepositoryContext,
    input: ProcessAttemptClaimInput,
  ): Promise<Result<ProcessAttemptClaimResult>> {
    this.claims.push(input);
    return ok({
      status: "claimed",
      attempt: {
        id: input.attemptId,
        kind: "runtime-maintenance",
        status: "running",
        operationKey: "scheduled-history-retention",
        updatedAt: input.claimedAt,
        nextActions: ["no-action"],
      },
    });
  }
}

class RecordingProcessAttemptCompleter implements ProcessAttemptCompleter {
  readonly completions: ProcessAttemptCompletionInput[] = [];

  async complete(
    _context: RepositoryContext,
    input: ProcessAttemptCompletionInput,
  ): Promise<Result<ProcessAttemptCompletionResult>> {
    this.completions.push(input);
    return ok({
      status: "completed",
      attempt: {
        id: input.attemptId,
        kind: "runtime-maintenance",
        status: input.status,
        operationKey: "scheduled-history-retention",
        updatedAt: input.completedAt,
        nextActions: input.nextActions,
      },
    });
  }
}

class RecordingRuntimeMonitoringSampleRetentionStore
  implements RuntimeMonitoringSampleRetentionStore
{
  readonly inputs: RuntimeMonitoringSamplePruneInput[] = [];

  constructor(
    private readonly result: Result<RuntimeMonitoringSamplePruneStoreResult> = ok({
      matchedCount: 2,
      prunedCount: 0,
    }),
  ) {}

  async prune(
    _context: RepositoryContext,
    input: RuntimeMonitoringSamplePruneInput,
  ): Promise<Result<RuntimeMonitoringSamplePruneStoreResult>> {
    this.inputs.push(input);
    return this.result;
  }
}

function retentionDefault(overrides: Partial<RetentionDefaultRecord> = {}): RetentionDefaultRecord {
  return {
    id: "rdf_primary",
    scope: "system",
    category: "audit-rows",
    retentionDays: 30,
    dryRunSchedulingEnabled: true,
    destructiveSchedulingEnabled: false,
    enabled: true,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const setupRepositoryContext = createExecutionContext({
  requestId: "req_scheduled_history_retention_setup",
  entrypoint: "system",
});

function createService(input: {
  repository: RetentionDefaultRepository;
  commandBus?: RecordingCommandBus;
  recorder?: MemoryProcessAttemptRecorder;
  claimer?: RecordingProcessAttemptClaimer;
  completer?: RecordingProcessAttemptCompleter;
  runtimeMonitoringSampleRetentionStore?: RecordingRuntimeMonitoringSampleRetentionStore;
}) {
  const commandBus = input.commandBus ?? new RecordingCommandBus();
  const recorder = input.recorder ?? new MemoryProcessAttemptRecorder();
  const claimer = input.claimer ?? new RecordingProcessAttemptClaimer();
  const completer = input.completer ?? new RecordingProcessAttemptCompleter();
  const runtimeMonitoringSampleRetentionStore =
    input.runtimeMonitoringSampleRetentionStore ??
    new RecordingRuntimeMonitoringSampleRetentionStore();
  const service = new ScheduledHistoryRetentionService(
    commandBus,
    input.repository,
    recorder,
    claimer,
    completer,
    new TestSequenceIdGenerator(),
    new FixedClock("2026-02-01T00:05:00.000Z"),
    runtimeMonitoringSampleRetentionStore,
  );
  return {
    service,
    commandBus,
    recorder,
    claimer,
    completer,
    runtimeMonitoringSampleRetentionStore,
  };
}

describe("scheduled history retention", () => {
  test("[SCHED-HISTORY-RETENTION-001] dispatches enabled retention defaults as dry-run by default", async () => {
    const repository = new MemoryRetentionDefaultRepository();
    await repository.upsert(setupRepositoryContext, retentionDefault());
    const { service, commandBus, recorder, claimer, completer } = createService({ repository });
    const context = createExecutionContext({
      requestId: "req_scheduled_history_retention_dry_run",
      entrypoint: "system",
    });

    const result = await service.run(context, { scheduledAt: "2026-02-01T00:00:00.000Z" });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "scheduled-history-retention.run/v1",
      scheduledAt: "2026-02-01T00:00:00.000Z",
      inspectedPolicyCount: 1,
      dispatchedCount: 1,
      skippedCount: 0,
      dispatches: [
        {
          category: "audit-rows",
          policyId: "rdf_primary",
          processAttemptId: "wrk_0001",
          operationKey: "audit-events.prune",
          before: "2026-01-02T00:00:00.000Z",
          dryRun: true,
          status: "dispatched",
        },
      ],
    });
    expect(commandBus.commands).toHaveLength(1);
    expect(commandBus.commands[0]).toBeInstanceOf(PruneAuditEventsCommand);
    expect(commandBus.commands[0]).toMatchObject({
      before: "2026-01-02T00:00:00.000Z",
      dryRun: true,
    });
    expect(recorder.attempts).toHaveLength(1);
    expect(recorder.attempts[0]).toMatchObject({
      id: "wrk_0001",
      operationKey: "audit-events.prune",
      status: "pending",
      phase: "scheduled-history-retention",
      step: "accepted",
    });
    expect(claimer.claims).toHaveLength(1);
    expect(completer.completions[0]).toMatchObject({
      attemptId: "wrk_0001",
      status: "succeeded",
      step: "audit-events.prune",
    });
  });

  test("[SCHED-HISTORY-RETENTION-006] limits scheduled retention policy batches", async () => {
    const repository = new MemoryRetentionDefaultRepository();
    await repository.upsert(
      setupRepositoryContext,
      retentionDefault({ id: "rdf_audit", category: "audit-rows" }),
    );
    await repository.upsert(
      setupRepositoryContext,
      retentionDefault({ id: "rdf_domain_events", category: "domain-event-streams" }),
    );
    await repository.upsert(
      setupRepositoryContext,
      retentionDefault({ id: "rdf_provider_logs", category: "provider-job-logs" }),
    );
    const { service, commandBus, recorder } = createService({ repository });
    const context = createExecutionContext({
      requestId: "req_scheduled_history_retention_limit",
      entrypoint: "system",
    });

    const result = await service.run(context, {
      scheduledAt: "2026-02-01T00:00:00.000Z",
      limit: 2,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      inspectedPolicyCount: 2,
      dispatchedCount: 2,
      skippedCount: 0,
      dispatches: [
        { policyId: "rdf_audit", operationKey: "audit-events.prune" },
        { policyId: "rdf_domain_events", operationKey: "domain-events.prune" },
      ],
    });
    expect(commandBus.commands).toHaveLength(2);
    expect(commandBus.commands[0]).toBeInstanceOf(PruneAuditEventsCommand);
    expect(commandBus.commands[1]).toBeInstanceOf(PruneDomainEventsCommand);
    expect(recorder.attempts.map((attempt) => attempt.safeDetails?.policyId)).toEqual([
      "rdf_audit",
      "rdf_domain_events",
    ]);
  });

  test("[SCHED-HISTORY-RETENTION-002] destructive scheduled retention is category-policy-gated", async () => {
    const repository = new MemoryRetentionDefaultRepository();
    await repository.upsert(
      setupRepositoryContext,
      retentionDefault({
        id: "rdf_events",
        category: "domain-event-streams",
        retentionDays: 1,
        destructiveSchedulingEnabled: true,
      }),
    );
    const { service, commandBus } = createService({ repository });
    const context = createExecutionContext({
      requestId: "req_scheduled_history_retention_destructive",
      entrypoint: "system",
    });

    const result = await service.run(context, { scheduledAt: "2026-02-01T00:00:00.000Z" });

    expect(result.isOk()).toBe(true);
    expect(commandBus.commands).toHaveLength(1);
    expect(commandBus.commands[0]).toBeInstanceOf(PruneDomainEventsCommand);
    expect(commandBus.commands[0]).toMatchObject({
      before: "2026-01-31T00:00:00.000Z",
      dryRun: false,
    });
    expect(result._unsafeUnwrap().dispatches[0]).toMatchObject({
      category: "domain-event-streams",
      dryRun: false,
      status: "dispatched",
    });
  });

  test("[RT-MON-001][SCHED-HISTORY-RETENTION-001] dispatches runtime monitoring sample retention through the prune store", async () => {
    const repository = new MemoryRetentionDefaultRepository();
    await repository.upsert(
      setupRepositoryContext,
      retentionDefault({
        id: "rdf_runtime_samples",
        category: "runtime-monitoring-samples",
      }),
    );
    const { service, commandBus, recorder, completer, runtimeMonitoringSampleRetentionStore } =
      createService({ repository });
    const context = createExecutionContext({
      requestId: "req_scheduled_history_retention_runtime_samples",
      entrypoint: "system",
    });

    const result = await service.run(context, { scheduledAt: "2026-02-01T00:00:00.000Z" });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      inspectedPolicyCount: 1,
      dispatchedCount: 1,
      skippedCount: 0,
      dispatches: [
        {
          category: "runtime-monitoring-samples",
          policyId: "rdf_runtime_samples",
          processAttemptId: "wrk_0001",
          operationKey: "runtime-monitoring.samples.prune",
          before: "2026-01-02T00:00:00.000Z",
          dryRun: true,
          status: "dispatched",
        },
      ],
    });
    expect(commandBus.commands).toHaveLength(0);
    expect(runtimeMonitoringSampleRetentionStore.inputs).toEqual([
      {
        before: "2026-01-02T00:00:00.000Z",
        dryRun: true,
      },
    ]);
    expect(recorder.attempts[0]).toMatchObject({
      id: "wrk_0001",
      operationKey: "runtime-monitoring.samples.prune",
      status: "pending",
      safeDetails: {
        category: "runtime-monitoring-samples",
        operationKey: "runtime-monitoring.samples.prune",
      },
    });
    expect(completer.completions[0]).toMatchObject({
      attemptId: "wrk_0001",
      status: "succeeded",
      step: "runtime-monitoring.samples.prune",
      safeDetails: {
        category: "runtime-monitoring-samples",
        operationKey: "runtime-monitoring.samples.prune",
        matchedCount: 2,
        prunedCount: 0,
      },
    });
  });

  test("[SCHED-HISTORY-RETENTION-004] records retry-scheduled safe details when dispatch fails", async () => {
    const repository = new MemoryRetentionDefaultRepository();
    await repository.upsert(setupRepositoryContext, retentionDefault());
    const commandBus = new RecordingCommandBus(
      err(
        domainError.infra("scheduled retention prune failed", {
          phase: "scheduled-history-retention-test",
        }),
      ),
    );
    const { service, completer } = createService({ repository, commandBus });
    const context = createExecutionContext({
      requestId: "req_scheduled_history_retention_failure",
      entrypoint: "system",
    });

    const result = await service.run(context, { scheduledAt: "2026-02-01T00:00:00.000Z" });

    expect(result.isErr()).toBe(true);
    expect(completer.completions).toHaveLength(1);
    expect(completer.completions[0]).toMatchObject({
      status: "retry-scheduled",
      errorCode: "infra_error",
      errorCategory: "infra",
      retriable: true,
      nextEligibleAt: "2026-02-01T00:05:00.000Z",
      nextActions: ["retry", "manual-review"],
      safeDetails: {
        policyId: "rdf_primary",
        category: "audit-rows",
        operationKey: "audit-events.prune",
        before: "2026-01-02T00:00:00.000Z",
        dryRun: true,
      },
    });
  });

  test("[SCHED-HISTORY-RETENTION-005] skips unsupported scheduled categories visibly", async () => {
    const repository = new MemoryRetentionDefaultRepository();
    await repository.upsert(
      setupRepositoryContext,
      retentionDefault({
        id: "rdf_unknown",
        category: "unknown-history" as RetentionDefaultCategory,
      }),
    );
    const { service, commandBus, recorder } = createService({ repository });
    const context = createExecutionContext({
      requestId: "req_scheduled_history_retention_unsupported",
      entrypoint: "system",
    });

    const result = await service.run(context, { scheduledAt: "2026-02-01T00:00:00.000Z" });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      inspectedPolicyCount: 1,
      dispatchedCount: 0,
      skippedCount: 1,
      dispatches: [
        {
          category: "unknown-history",
          policyId: "rdf_unknown",
          status: "unsupported-category",
        },
      ],
    });
    expect(commandBus.commands).toHaveLength(0);
    expect(recorder.attempts).toHaveLength(0);
  });
});
