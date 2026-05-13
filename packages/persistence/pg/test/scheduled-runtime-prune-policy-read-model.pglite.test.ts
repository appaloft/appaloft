import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  PruneServerCapacityCommand,
  PruneServerCapacityUseCase,
  type RepositoryContext,
  type RuntimeTargetCapacityPruneResult,
  type RuntimeTargetCapacityPruner,
  ScheduledRuntimePrunePolicyResolver,
  ScheduledRuntimePruneService,
  type ServerRepository,
  toRepositoryContext,
} from "@appaloft/application";
import {
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetId,
  DeploymentTargetLifecycleStatusValue,
  DeploymentTargetName,
  HostAddress,
  ok,
  PortNumber,
  ProviderKey,
  type Result,
  TargetKindValue,
} from "@appaloft/core";

class FixedIdGenerator {
  next(prefix: string): string {
    return `${prefix}_scheduled_prune`;
  }
}

class SequenceClock {
  private index = 0;

  constructor(private readonly values: string[]) {}

  now(): string {
    const value =
      this.values[Math.min(this.index, this.values.length - 1)] ?? "2026-01-15T00:00:00.000Z";
    this.index += 1;
    return value;
  }
}

class SuccessfulPruneCommandBus implements Pick<CommandBus, "execute"> {
  readonly commands: Command<unknown>[] = [];

  async execute<TResult>(
    _context: ExecutionContext,
    command: Command<TResult>,
  ): Promise<Result<TResult>> {
    this.commands.push(command as Command<unknown>);
    return ok(pruneResult() as TResult);
  }
}

class PruneServerCapacityUseCaseCommandBus implements Pick<CommandBus, "execute"> {
  readonly commands: Command<unknown>[] = [];

  constructor(private readonly useCase: PruneServerCapacityUseCase) {}

  async execute<TResult>(
    context: ExecutionContext,
    command: Command<TResult>,
  ): Promise<Result<TResult>> {
    this.commands.push(command as Command<unknown>);
    if (!(command instanceof PruneServerCapacityCommand)) {
      throw new Error(`Unsupported command in scheduled runtime prune persistence test`);
    }

    return (await this.useCase.execute(context, command.input)) as Result<TResult>;
  }
}

class MemoryServerRepository implements ServerRepository {
  constructor(private readonly server: DeploymentTarget) {}

  async findOne(): Promise<DeploymentTarget | null> {
    return this.server;
  }

  async upsert(): Promise<void> {}
}

class FakeDestructiveCapacityPruner implements RuntimeTargetCapacityPruner {
  async prune(
    _context: Parameters<RuntimeTargetCapacityPruner["prune"]>[0],
    input: Parameters<RuntimeTargetCapacityPruner["prune"]>[1],
  ): Promise<Result<RuntimeTargetCapacityPruneResult>> {
    return ok({
      schemaVersion: "servers.capacity.prune/v1",
      server: {
        id: input.server.id.value,
        name: input.server.name.value,
        host: input.server.host.value,
        port: input.server.port.value,
        providerKey: input.server.providerKey.value,
        targetKind: input.server.targetKind.value,
      },
      before: input.before,
      categories: input.categories,
      dryRun: input.dryRun,
      prunedAt: "2026-01-31T00:00:10.000Z",
      summary: {
        inspectedCount: 1,
        matchedCount: 1,
        prunedCount: input.dryRun ? 0 : 1,
        skippedCount: 0,
        excludedCount: 0,
        reclaimedBytes: input.dryRun ? 0 : 1024,
      },
      candidates: [
        {
          id: "candidate_1",
          category: input.categories[0] ?? "stopped-containers",
          target: "/var/lib/appaloft/runtime/local-deployments/dep_old",
          updatedAt: "2026-01-01T00:00:00.000Z",
          size: 1024,
          action: input.dryRun ? "matched" : "pruned",
        },
      ],
      warnings: [],
    });
  }
}

function pruneResult(): RuntimeTargetCapacityPruneResult {
  return {
    schemaVersion: "servers.capacity.prune/v1",
    server: {
      id: "srv_primary",
      name: "Primary",
      host: "203.0.113.10",
      port: 22,
      providerKey: "generic-ssh",
      targetKind: "single-server",
    },
    before: "2026-01-08T00:00:00.000Z",
    categories: ["preview-workspaces"],
    dryRun: true,
    prunedAt: "2026-01-15T00:00:10.000Z",
    summary: {
      inspectedCount: 1,
      matchedCount: 1,
      prunedCount: 0,
      skippedCount: 0,
      excludedCount: 0,
      reclaimedBytes: 0,
    },
    candidates: [],
    warnings: [],
  };
}

function deploymentTarget(): DeploymentTarget {
  return DeploymentTarget.rehydrate({
    id: DeploymentTargetId.rehydrate("srv_primary"),
    name: DeploymentTargetName.rehydrate("Primary"),
    providerKey: ProviderKey.rehydrate("generic-ssh"),
    targetKind: TargetKindValue.rehydrate("single-server"),
    host: HostAddress.rehydrate("203.0.113.10"),
    port: PortNumber.rehydrate(22),
    lifecycleStatus: DeploymentTargetLifecycleStatusValue.active(),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

describe("scheduled runtime prune policy read model", () => {
  test("[RT-CAP-SCHED-001] reads enabled persisted policies for precedence-safe resolver readback", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-prune-policy-"));
    const { createDatabase, createMigrator, PgScheduledRuntimePrunePolicyReadModel } = await import(
      "../src"
    );
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: join(dataDir, "pglite"),
    });

    try {
      const migrations = await createMigrator(database.db).migrateToLatest();
      if (migrations.error) {
        throw migrations.error;
      }

      await database.db
        .insertInto("scheduled_runtime_prune_policies")
        .values([
          {
            id: "rpp_defaults",
            version: "v1",
            scope: "defaults",
            server_id: "*",
            retention_days: 90,
            destructive: false,
            categories: ["stopped-containers"],
            retry_on_failure: true,
            enabled: true,
            updated_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "rpp_system_disabled",
            version: "v1",
            scope: "system",
            server_id: "srv_primary",
            retention_days: 14,
            destructive: true,
            categories: ["unused-images"],
            retry_on_failure: true,
            enabled: false,
            updated_at: "2026-01-02T00:00:00.000Z",
          },
          {
            id: "rpp_project",
            version: "v3",
            scope: "project",
            server_id: "srv_primary",
            retention_days: 30,
            destructive: true,
            categories: ["stopped-containers", "docker-build-cache"],
            retry_on_failure: false,
            enabled: true,
            updated_at: "2026-01-03T00:00:00.000Z",
          },
          {
            id: "rpp_environment",
            version: "v2",
            scope: "environment",
            server_id: "srv_primary",
            retention_days: 7,
            destructive: false,
            categories: ["preview-workspaces"],
            retry_on_failure: true,
            enabled: true,
            updated_at: "2026-01-04T00:00:00.000Z",
          },
          {
            id: "rpp_deployment_snapshot",
            version: "v4",
            scope: "deployment-snapshot",
            server_id: "srv_primary",
            retention_days: 2,
            destructive: true,
            categories: ["unused-images"],
            retry_on_failure: false,
            enabled: true,
            updated_at: "2026-01-06T00:00:00.000Z",
          },
          {
            id: "rpp_other_server",
            version: "v1",
            scope: "deployment-snapshot",
            server_id: "srv_secondary",
            retention_days: 5,
            destructive: true,
            categories: ["source-workspaces"],
            retry_on_failure: true,
            enabled: true,
            updated_at: "2026-01-05T00:00:00.000Z",
          },
        ])
        .execute();

      const context = toRepositoryContext(
        createExecutionContext({
          requestId: "req_runtime_prune_policy_read_model_test",
          entrypoint: "system",
        }),
      );
      const readModel = new PgScheduledRuntimePrunePolicyReadModel(database.db);
      const policiesResult = await readModel.list(context, { serverId: "srv_primary" });
      expect(policiesResult.isOk()).toBe(true);

      const policies = policiesResult._unsafeUnwrap();
      expect(policies.map((policy) => policy.id)).toEqual([
        "rpp_defaults",
        "rpp_project",
        "rpp_environment",
        "rpp_deployment_snapshot",
      ]);
      expect(policies).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: "rpp_system_disabled" })]),
      );
      expect(policies).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: "rpp_other_server" })]),
      );

      const resolution = new ScheduledRuntimePrunePolicyResolver().resolve({
        serverId: "srv_primary",
        policies,
      });

      expect(resolution.isOk()).toBe(true);
      expect(resolution._unsafeUnwrap()).toMatchObject({
        schemaVersion: "scheduled-runtime-prune.policy-resolution/v1",
        serverId: "srv_primary",
        selectedPolicy: {
          id: "rpp_deployment_snapshot",
          version: "v4",
          scope: "deployment-snapshot",
          serverId: "srv_primary",
          retentionDays: 2,
          destructive: true,
          categories: ["unused-images"],
          categoryCount: 1,
        },
      });
      expect(resolution._unsafeUnwrap().candidates).toEqual([
        expect.objectContaining({ id: "rpp_deployment_snapshot", categoryCount: 1 }),
        expect.objectContaining({ id: "rpp_environment", categoryCount: 1 }),
        expect.objectContaining({ id: "rpp_project", categoryCount: 2 }),
        expect.objectContaining({ id: "rpp_defaults", categoryCount: 1 }),
      ]);
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });

  test("[RT-CAP-SCHED-004] [RT-CAP-SCHED-005] [PROC-DELIVERY-001] [PROC-DELIVERY-002] [PROC-DELIVERY-005] persists scheduled prune process attempt handoff", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-prune-handoff-"));
    const {
      createDatabase,
      createMigrator,
      PgProcessAttemptJournal,
      PgScheduledRuntimePrunePolicyReadModel,
    } = await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: join(dataDir, "pglite"),
    });

    try {
      const migrations = await createMigrator(database.db).migrateToLatest();
      if (migrations.error) {
        throw migrations.error;
      }

      await database.db
        .insertInto("scheduled_runtime_prune_policies")
        .values({
          id: "rpp_environment",
          version: "v2",
          scope: "environment",
          server_id: "srv_primary",
          retention_days: 7,
          destructive: false,
          categories: ["preview-workspaces"],
          retry_on_failure: true,
          enabled: true,
          updated_at: "2026-01-04T00:00:00.000Z",
        })
        .execute();

      const executionContext = createExecutionContext({
        requestId: "req_runtime_prune_handoff_test",
        entrypoint: "system",
      });
      const repositoryContext = toRepositoryContext(executionContext);
      const readModel = new PgScheduledRuntimePrunePolicyReadModel(database.db);
      const policyResult = await readModel.list(repositoryContext, { serverId: "srv_primary" });
      expect(policyResult.isOk()).toBe(true);
      const selectedPolicy = new ScheduledRuntimePrunePolicyResolver()
        .resolve({
          serverId: "srv_primary",
          policies: policyResult._unsafeUnwrap(),
        })
        ._unsafeUnwrap().selectedPolicy;
      expect(selectedPolicy).toBeDefined();

      const journal = new PgProcessAttemptJournal(database.db);
      const commandBus = new SuccessfulPruneCommandBus();
      const service = new ScheduledRuntimePruneService(
        commandBus,
        journal,
        journal,
        journal,
        new FixedIdGenerator(),
        new SequenceClock(["2026-01-15T00:00:00.000Z", "2026-01-15T00:00:10.000Z"]),
      );

      const result = await service.run(executionContext, {
        policy: {
          id: selectedPolicy?.id ?? "missing",
          version: selectedPolicy?.version ?? "missing",
          scope: selectedPolicy?.scope ?? "environment",
          serverId: selectedPolicy?.serverId ?? "srv_primary",
          retentionDays: selectedPolicy?.retentionDays ?? 7,
          destructive: selectedPolicy?.destructive ?? false,
          categories: selectedPolicy?.categories ?? ["preview-workspaces"],
        },
        scheduledAt: "2026-01-15T00:00:00.000Z",
      });

      expect(result.isOk()).toBe(true);
      expect(commandBus.commands).toHaveLength(1);

      const persisted = await journal.findOne(repositoryContext, "wrk_scheduled_prune");
      expect(persisted).toMatchObject({
        id: "wrk_scheduled_prune",
        kind: "runtime-maintenance",
        status: "succeeded",
        operationKey: "servers.capacity.prune",
        dedupeKey: "scheduled-runtime-prune:srv_primary:rpp_environment:2026-01-15T00:00:00.000Z",
        correlationId: "req_runtime_prune_handoff_test",
        requestId: "req_runtime_prune_handoff_test",
        serverId: "srv_primary",
        startedAt: "2026-01-15T00:00:00.000Z",
        finishedAt: "2026-01-15T00:00:00.000Z",
        phase: "scheduled-runtime-prune",
        step: "servers-capacity-prune",
        nextActions: ["no-action"],
        safeDetails: {
          trigger: "scheduled-runtime-prune",
          policyId: "rpp_environment",
          policyVersion: "v2",
          policyScope: "environment",
          serverId: "srv_primary",
          before: "2026-01-08T00:00:00.000Z",
          dryRun: true,
          categoryCount: 1,
          claimedAt: "2026-01-15T00:00:00.000Z",
          claimedBy: "scheduled-runtime-prune-worker",
          prunedCount: 0,
          reclaimedBytes: 0,
        },
      });
      expect(JSON.stringify(persisted)).not.toContain("PRIVATE_KEY");
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });

  test("[RT-CAP-SCHED-006] persists destructive scheduled prune audit output through the handoff", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-prune-audit-handoff-"));
    const {
      createDatabase,
      createMigrator,
      PgAuditEventReadModel,
      PgProcessAttemptJournal,
      PgScheduledRuntimePrunePolicyReadModel,
    } = await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: join(dataDir, "pglite"),
    });

    try {
      const migrations = await createMigrator(database.db).migrateToLatest();
      if (migrations.error) {
        throw migrations.error;
      }

      await database.db
        .insertInto("scheduled_runtime_prune_policies")
        .values({
          id: "rpp_destructive",
          version: "v1",
          scope: "deployment-snapshot",
          server_id: "srv_primary",
          retention_days: 30,
          destructive: true,
          categories: ["stopped-containers"],
          retry_on_failure: true,
          enabled: true,
          updated_at: "2026-01-04T00:00:00.000Z",
        })
        .execute();

      const executionContext = createExecutionContext({
        requestId: "req_runtime_prune_audit_handoff_test",
        entrypoint: "system",
      });
      const repositoryContext: RepositoryContext = toRepositoryContext(executionContext);
      const policyReadModel = new PgScheduledRuntimePrunePolicyReadModel(database.db);
      const policyResult = await policyReadModel.list(repositoryContext, {
        serverId: "srv_primary",
      });
      expect(policyResult.isOk()).toBe(true);
      const selectedPolicy = new ScheduledRuntimePrunePolicyResolver()
        .resolve({
          serverId: "srv_primary",
          policies: policyResult._unsafeUnwrap(),
        })
        ._unsafeUnwrap().selectedPolicy;
      expect(selectedPolicy).toBeDefined();

      const journal = new PgProcessAttemptJournal(database.db);
      const auditEvents = new PgAuditEventReadModel(database.db);
      const commandBus = new PruneServerCapacityUseCaseCommandBus(
        new PruneServerCapacityUseCase(
          new MemoryServerRepository(deploymentTarget()),
          new FakeDestructiveCapacityPruner(),
          auditEvents,
          new FixedIdGenerator(),
          new SequenceClock(["2026-01-31T00:00:11.000Z"]),
        ),
      );
      const service = new ScheduledRuntimePruneService(
        commandBus,
        journal,
        journal,
        journal,
        new FixedIdGenerator(),
        new SequenceClock(["2026-01-31T00:00:00.000Z", "2026-01-31T00:00:12.000Z"]),
      );

      const result = await service.run(executionContext, {
        policy: {
          id: selectedPolicy?.id ?? "missing",
          version: selectedPolicy?.version ?? "missing",
          scope: selectedPolicy?.scope ?? "deployment-snapshot",
          serverId: selectedPolicy?.serverId ?? "srv_primary",
          retentionDays: selectedPolicy?.retentionDays ?? 30,
          destructive: selectedPolicy?.destructive ?? true,
          categories: selectedPolicy?.categories ?? ["stopped-containers"],
        },
        scheduledAt: "2026-01-31T00:00:00.000Z",
      });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toMatchObject({
        dryRun: false,
        before: "2026-01-01T00:00:00.000Z",
        prune: {
          summary: {
            prunedCount: 1,
            reclaimedBytes: 1024,
          },
        },
      });
      expect(commandBus.commands).toHaveLength(1);

      const persistedAttempt = await journal.findOne(repositoryContext, "wrk_scheduled_prune");
      expect(persistedAttempt).toMatchObject({
        id: "wrk_scheduled_prune",
        kind: "runtime-maintenance",
        status: "succeeded",
        operationKey: "servers.capacity.prune",
        dedupeKey: "scheduled-runtime-prune:srv_primary:rpp_destructive:2026-01-31T00:00:00.000Z",
        safeDetails: {
          trigger: "scheduled-runtime-prune",
          policyId: "rpp_destructive",
          policyVersion: "v1",
          policyScope: "deployment-snapshot",
          serverId: "srv_primary",
          before: "2026-01-01T00:00:00.000Z",
          dryRun: false,
          categoryCount: 1,
          claimedAt: "2026-01-31T00:00:00.000Z",
          claimedBy: "scheduled-runtime-prune-worker",
          prunedCount: 1,
          reclaimedBytes: 1024,
        },
      });

      const audit = await auditEvents.findOne(repositoryContext, {
        auditEventId: "aud_scheduled_prune",
        aggregateId: "srv_primary",
      });
      expect(audit).toEqual({
        auditEventId: "aud_scheduled_prune",
        aggregateId: "srv_primary",
        eventType: "server-capacity-pruned",
        payload: {
          operationKey: "servers.capacity.prune",
          serverId: "srv_primary",
          before: "2026-01-01T00:00:00.000Z",
          categories: ["stopped-containers"],
          inspectedCount: 1,
          matchedCount: 1,
          prunedCount: 1,
          skippedCount: 0,
          excludedCount: 0,
          reclaimedBytes: 1024,
          prunedAt: "2026-01-31T00:00:10.000Z",
        },
        redactedFields: [],
        createdAt: "2026-01-31T00:00:11.000Z",
      });
      expect(JSON.stringify({ audit, persistedAttempt })).not.toContain("PRIVATE_KEY");
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });

  test("[RT-CAP-SCHED-001] persists policy upserts and filters safe readback records", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-prune-policy-upsert-"));
    const { createDatabase, createMigrator, PgScheduledRuntimePrunePolicyReadModel } = await import(
      "../src"
    );
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: join(dataDir, "pglite"),
    });

    try {
      const migrations = await createMigrator(database.db).migrateToLatest();
      if (migrations.error) {
        throw migrations.error;
      }

      const context = toRepositoryContext(
        createExecutionContext({
          requestId: "req_runtime_prune_policy_upsert_test",
          entrypoint: "system",
        }),
      );
      const repository = new PgScheduledRuntimePrunePolicyReadModel(database.db);

      const first = await repository.upsert(context, {
        id: "rpp_project",
        version: "v1",
        scope: "project",
        serverId: "srv_primary",
        retentionDays: 30,
        destructive: false,
        categories: ["stopped-containers"],
        retryOnFailure: true,
        enabled: false,
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      const second = await repository.upsert(context, {
        id: "rpp_project",
        version: "v2",
        scope: "environment",
        serverId: "srv_primary",
        retentionDays: 7,
        destructive: true,
        categories: ["stopped-containers", "docker-build-cache"],
        retryOnFailure: false,
        enabled: true,
        updatedAt: "2026-01-02T00:00:00.000Z",
      });
      const disabled = await repository.upsert(context, {
        id: "rpp_disabled",
        version: "v1",
        scope: "system",
        serverId: "srv_primary",
        retentionDays: 90,
        destructive: false,
        categories: ["preview-workspaces"],
        retryOnFailure: true,
        enabled: false,
        updatedAt: "2026-01-03T00:00:00.000Z",
      });
      const deploymentSnapshot = await repository.upsert(context, {
        id: "rpp_snapshot",
        version: "v1",
        scope: "deployment-snapshot",
        serverId: "srv_primary",
        retentionDays: 2,
        destructive: true,
        categories: ["unused-images"],
        retryOnFailure: false,
        enabled: true,
        updatedAt: "2026-01-04T00:00:00.000Z",
      });

      expect(first.isOk()).toBe(true);
      expect(second.isOk()).toBe(true);
      expect(disabled.isOk()).toBe(true);
      expect(deploymentSnapshot.isOk()).toBe(true);

      const found = await repository.findOne(context, "rpp_project");
      expect(found.isOk()).toBe(true);
      expect(found._unsafeUnwrap()).toEqual({
        id: "rpp_project",
        version: "v2",
        scope: "environment",
        serverId: "srv_primary",
        retentionDays: 7,
        destructive: true,
        categories: ["stopped-containers", "docker-build-cache"],
        retryOnFailure: false,
        enabled: true,
        updatedAt: "2026-01-02T00:00:00.000Z",
      });

      const all = await repository.listRecords(context, { serverId: "srv_primary" });
      const enabled = await repository.list(context, { serverId: "srv_primary" });

      expect(all.isOk()).toBe(true);
      expect(all._unsafeUnwrap().map((policy) => policy.id)).toEqual([
        "rpp_project",
        "rpp_disabled",
        "rpp_snapshot",
      ]);
      expect(enabled.isOk()).toBe(true);
      expect(enabled._unsafeUnwrap().map((policy) => policy.id)).toEqual([
        "rpp_project",
        "rpp_snapshot",
      ]);
      expect(JSON.stringify(all._unsafeUnwrap())).not.toContain("PRIVATE_KEY");
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });
});
