import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok, type Result } from "@appaloft/core";
import { FixedClock, SequenceIdGenerator as TestSequenceIdGenerator } from "@appaloft/testkit";

import { type Command, type CommandBus } from "../src/cqrs";
import {
  createExecutionContext,
  type ExecutionContext,
  type RepositoryContext,
} from "../src/execution-context";
import { PruneAuditEventsCommand } from "../src/operations/audit-events/prune-audit-events.command";
import { PruneDomainEventsCommand } from "../src/operations/domain-events/prune-domain-events.command";
import { PruneDomainEventsUseCase } from "../src/operations/domain-events/prune-domain-events.use-case";
import { PruneProviderJobLogsCommand } from "../src/operations/provider-job-logs/prune-provider-job-logs.command";
import { ConfigureRetentionDefaultsCommand } from "../src/operations/retention-defaults/configure-retention-defaults.command";
import { ConfigureRetentionDefaultsCommandHandler } from "../src/operations/retention-defaults/configure-retention-defaults.handler";
import { ConfigureRetentionDefaultsUseCase } from "../src/operations/retention-defaults/configure-retention-defaults.use-case";
import { ListRetentionDefaultsQueryService } from "../src/operations/retention-defaults/list-retention-defaults.query-service";
import {
  type RetentionDefaultCategory,
  type RetentionDefaultListFilter,
  type RetentionDefaultRecord,
  type RetentionDefaultRepository,
} from "../src/operations/retention-defaults/retention-defaults.service";
import { ShowRetentionDefaultQueryService } from "../src/operations/retention-defaults/show-retention-default.query-service";
import {
  type DomainEventStreamPruneInput,
  type DomainEventStreamPruneStoreResult,
  type DomainEventStreamRetentionStore,
} from "../src/ports";

class RecordingCommandBus implements Pick<CommandBus, "execute"> {
  readonly commands: Command<unknown>[] = [];

  async execute<TResult>(
    _context: ExecutionContext,
    command: Command<TResult>,
  ): Promise<Result<TResult>> {
    this.commands.push(command as Command<unknown>);
    return ok({} as TResult);
  }
}

class MemoryRetentionDefaultRepository implements RetentionDefaultRepository {
  readonly items = new Map<string, RetentionDefaultRecord>();

  async findOne(
    _context: RepositoryContext,
    input: { category: RetentionDefaultCategory; scope?: string; organizationId?: string },
  ): Promise<Result<RetentionDefaultRecord | null>> {
    return ok(
      Array.from(this.items.values()).find(
        (record) =>
          record.category === input.category &&
          record.scope === (input.scope ?? record.scope) &&
          record.organizationId === input.organizationId,
      ) ?? null,
    );
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

interface DomainEventStreamRow {
  id: string;
  eventType: string;
  aggregateId: string;
  aggregateType: string;
  deploymentId?: string;
  occurredAt: string;
  guardReason?: string;
}

class GuardedDomainEventStreamRetentionStore implements DomainEventStreamRetentionStore {
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

function domainEventRow(overrides: Partial<DomainEventStreamRow> = {}): DomainEventStreamRow {
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

describe("retention defaults", () => {
  test("[ORG-RETENTION-DEFAULTS-001] configures category defaults without executing prune work", async () => {
    const repository = new MemoryRetentionDefaultRepository();
    const commandBus = new RecordingCommandBus();
    const useCase = new ConfigureRetentionDefaultsUseCase(
      repository,
      new FixedClock("2026-02-01T00:00:00.000Z"),
      new TestSequenceIdGenerator(),
    );
    const handler = new ConfigureRetentionDefaultsCommandHandler(useCase);
    const command = ConfigureRetentionDefaultsCommand.create({
      scope: "organization",
      organizationId: "org_primary",
      category: "domain-event-streams",
      retentionDays: 90,
      dryRunSchedulingEnabled: true,
      destructiveSchedulingEnabled: true,
      enabled: true,
    });
    expect(command.isOk()).toBe(true);
    const context = createExecutionContext({
      requestId: "req_retention_defaults_configure",
      entrypoint: "system",
      actor: { kind: "user", id: "usr_admin", label: "Admin" },
    });

    const result = await handler.handle(context, command._unsafeUnwrap());

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ id: "rdf_0001" });
    expect(commandBus.commands).toHaveLength(0);
    expect(repository.items.get("rdf_0001")).toEqual({
      id: "rdf_0001",
      scope: "organization",
      organizationId: "org_primary",
      category: "domain-event-streams",
      retentionDays: 90,
      dryRunSchedulingEnabled: true,
      destructiveSchedulingEnabled: true,
      enabled: true,
      updatedAt: "2026-02-01T00:00:00.000Z",
      updatedByActorId: "usr_admin",
      updatedByActorKind: "user",
    });
  });

  test("[ORG-RETENTION-DEFAULTS-002] lists and shows safe retention default readback", async () => {
    const repository = new MemoryRetentionDefaultRepository();
    const context = createExecutionContext({
      requestId: "req_retention_defaults_readback",
      entrypoint: "system",
      actor: { kind: "system", id: "system" },
    });
    const configureUseCase = new ConfigureRetentionDefaultsUseCase(
      repository,
      new FixedClock("2026-02-01T00:00:00.000Z"),
      new TestSequenceIdGenerator(),
    );
    const listService = new ListRetentionDefaultsQueryService(repository);
    const showService = new ShowRetentionDefaultQueryService(repository);

    const configured = await configureUseCase.execute(context, {
      scope: "system",
      category: "provider-job-logs",
      retentionDays: 30,
      dryRunSchedulingEnabled: true,
      destructiveSchedulingEnabled: false,
      enabled: true,
    });
    expect(configured.isOk()).toBe(true);

    const list = await listService.execute(context);
    expect(list.isOk()).toBe(true);
    expect(list._unsafeUnwrap()).toEqual({
      schemaVersion: "retention-defaults.list/v1",
      items: [
        {
          schemaVersion: "retention-defaults.policy/v1",
          id: "rdf_0001",
          scope: "system",
          category: "provider-job-logs",
          retentionDays: 30,
          dryRunSchedulingEnabled: true,
          destructiveSchedulingEnabled: false,
          enabled: true,
          updatedAt: "2026-02-01T00:00:00.000Z",
          updatedByActorId: "system",
          updatedByActorKind: "system",
        },
      ],
    });

    const shown = await showService.execute(context, {
      scope: "system",
      category: "provider-job-logs",
    });
    expect(shown.isOk()).toBe(true);
    const shownPolicy = list._unsafeUnwrap().items[0];
    expect(shownPolicy).toBeDefined();
    expect(shown._unsafeUnwrap()).toEqual({
      schemaVersion: "retention-defaults.show/v1",
      policy: shownPolicy ?? null,
    });
    expect(JSON.stringify(list._unsafeUnwrap())).not.toContain("PRIVATE_KEY");
  });

  test("[ORG-RETENTION-DEFAULTS-003] manual prune commands still require explicit cutoff input", async () => {
    const repository = new MemoryRetentionDefaultRepository();
    const context = createExecutionContext({
      requestId: "req_retention_defaults_manual_prune",
      entrypoint: "system",
    });
    const configureUseCase = new ConfigureRetentionDefaultsUseCase(
      repository,
      new FixedClock("2026-02-01T00:00:00.000Z"),
      new TestSequenceIdGenerator(),
    );
    const configured = await configureUseCase.execute(context, {
      scope: "system",
      category: "audit-rows",
      retentionDays: 30,
      dryRunSchedulingEnabled: true,
      destructiveSchedulingEnabled: true,
      enabled: true,
    });
    expect(configured.isOk()).toBe(true);

    expect(PruneAuditEventsCommand.create({ dryRun: false }).isErr()).toBe(true);
    expect(PruneDomainEventsCommand.create({ dryRun: false }).isErr()).toBe(true);
    expect(PruneProviderJobLogsCommand.create({ dryRun: false }).isErr()).toBe(true);
  });

  test("[ORG-RETENTION-DEFAULTS-004] category guards remain authoritative over retention defaults", async () => {
    const repository = new MemoryRetentionDefaultRepository();
    const context = createExecutionContext({
      requestId: "req_retention_defaults_category_guards",
      entrypoint: "system",
      actor: { kind: "system", id: "system" },
    });
    const configureUseCase = new ConfigureRetentionDefaultsUseCase(
      repository,
      new FixedClock("2026-02-01T00:00:00.000Z"),
      new TestSequenceIdGenerator(),
    );
    const configured = await configureUseCase.execute(context, {
      scope: "system",
      category: "domain-event-streams",
      retentionDays: 1,
      dryRunSchedulingEnabled: false,
      destructiveSchedulingEnabled: true,
      enabled: true,
    });
    expect(configured.isOk()).toBe(true);

    const store = new GuardedDomainEventStreamRetentionStore([
      domainEventRow({ id: "des_candidate" }),
      domainEventRow({ id: "des_recovery_guard", guardReason: "recovery-readiness" }),
      domainEventRow({ id: "des_rollback_guard", guardReason: "rollback-candidate" }),
    ]);
    const pruneUseCase = new PruneDomainEventsUseCase(
      store,
      new FixedClock("2026-02-01T00:05:00.000Z"),
    );
    const command = PruneDomainEventsCommand.create({
      before: "2026-01-02T00:00:00.000Z",
      deploymentId: "dep_primary",
      dryRun: false,
    });
    expect(command.isOk()).toBe(true);

    const result = await pruneUseCase.execute(context, command._unsafeUnwrap());

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "domain-events.prune/v1",
      before: "2026-01-02T00:00:00.000Z",
      deploymentId: "dep_primary",
      dryRun: false,
      inspectedCount: 3,
      candidateCount: 1,
      prunedCount: 1,
      skippedCount: 2,
      skippedCountsByReason: {
        "recovery-readiness": 1,
        "rollback-candidate": 1,
      },
    });
    expect(store.inputs).toEqual([
      {
        before: "2026-01-02T00:00:00.000Z",
        deploymentId: "dep_primary",
        dryRun: false,
      },
    ]);
    expect(store.list().map((row) => row.id)).toEqual(["des_recovery_guard", "des_rollback_guard"]);
  });
});
