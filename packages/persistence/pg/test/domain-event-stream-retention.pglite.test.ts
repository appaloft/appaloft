import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import { type Kysely } from "kysely";

import { type Database } from "../src";

async function seedDomainEventStreamRecord(
  db: Kysely<Database>,
  input: {
    id: string;
    cursor: string;
    eventType?: string;
    sourceKind?: "domain-event" | "process-observation" | "progress-projection";
    aggregateId?: string;
    aggregateType?: string;
    deploymentId?: string | null;
    occurredAt: string;
    guardReason?: string | null;
    payload?: Record<string, unknown>;
    summary?: string;
  },
): Promise<void> {
  await db
    .insertInto("domain_event_stream_records")
    .values({
      id: input.id,
      stream_scope: input.deploymentId ? "deployment" : "domain",
      stream_id: input.deploymentId ?? input.aggregateId ?? "global",
      cursor: input.cursor,
      occurred_at: input.occurredAt,
      event_type: input.eventType ?? "deployment.finished",
      source_kind: input.sourceKind ?? "domain-event",
      aggregate_id: input.aggregateId ?? "dep_primary",
      aggregate_type: input.aggregateType ?? "deployment",
      deployment_id: input.deploymentId ?? null,
      correlation_id: null,
      causation_id: null,
      request_id: "req_seed",
      summary: input.summary ?? "safe summary",
      payload: input.payload ?? { safe: true },
      guard_reason: input.guardReason ?? null,
      created_at: input.occurredAt,
    })
    .execute();
}

describe("domain event stream retention persistence", () => {
  test("[DOMAIN-EVENT-RETENTION-001][DOMAIN-EVENT-RETENTION-002][DOMAIN-EVENT-RETENTION-003] prunes retained event rows and writes watermarks", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-domain-event-retention-"));
    const { createDatabase, createMigrator, PgDomainEventStreamRetentionStore } = await import(
      "../src"
    );
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      await seedDomainEventStreamRecord(database.db, {
        id: "des_match",
        cursor: "evt_001",
        deploymentId: "dep_primary",
        occurredAt: "2026-01-01T00:00:00.000Z",
      });
      await seedDomainEventStreamRecord(database.db, {
        id: "des_cutoff_equal",
        cursor: "evt_002",
        deploymentId: "dep_primary",
        occurredAt: "2026-01-01T00:05:00.000Z",
      });
      await seedDomainEventStreamRecord(database.db, {
        id: "des_newer",
        cursor: "evt_003",
        deploymentId: "dep_primary",
        occurredAt: "2026-01-01T00:06:00.000Z",
      });
      await seedDomainEventStreamRecord(database.db, {
        id: "des_other_deployment",
        cursor: "evt_004",
        deploymentId: "dep_other",
        occurredAt: "2026-01-01T00:00:00.000Z",
      });
      await seedDomainEventStreamRecord(database.db, {
        id: "des_recovery_guard",
        cursor: "evt_005",
        deploymentId: "dep_primary",
        occurredAt: "2026-01-01T00:00:00.000Z",
        guardReason: "recovery-readiness",
      });

      const context = toRepositoryContext(
        createExecutionContext({
          requestId: "req_domain_event_retention_pg_test",
          entrypoint: "system",
        }),
      );
      const store = new PgDomainEventStreamRetentionStore(database.db);

      const dryRun = await store.prune(context, {
        before: "2026-01-01T00:05:00.000Z",
        deploymentId: "dep_primary",
        dryRun: true,
      });
      const afterDryRunRows = await database.db
        .selectFrom("domain_event_stream_records")
        .select("id")
        .orderBy("id")
        .execute();
      const destructive = await store.prune(context, {
        before: "2026-01-01T00:05:00.000Z",
        deploymentId: "dep_primary",
        dryRun: false,
      });
      const remainingRows = await database.db
        .selectFrom("domain_event_stream_records")
        .select("id")
        .orderBy("id")
        .execute();
      const watermarks = await database.db
        .selectFrom("domain_event_stream_prune_watermarks")
        .select(["stream_scope", "stream_id", "pruned_before", "last_pruned_cursor"])
        .execute();
      const normalizedWatermarks = watermarks.map((row) => ({
        ...row,
        pruned_before:
          typeof row.pruned_before === "string"
            ? row.pruned_before
            : (row.pruned_before as unknown as Date).toISOString(),
      }));

      expect(dryRun.isOk()).toBe(true);
      expect(dryRun._unsafeUnwrap()).toEqual({
        inspectedCount: 2,
        candidateCount: 1,
        prunedCount: 0,
        skippedCount: 1,
        countsByEventType: {
          "deployment.finished": 1,
        },
        skippedCountsByReason: {
          "recovery-readiness": 1,
        },
      });
      expect(afterDryRunRows.map((row) => row.id)).toEqual([
        "des_cutoff_equal",
        "des_match",
        "des_newer",
        "des_other_deployment",
        "des_recovery_guard",
      ]);
      expect(destructive.isOk()).toBe(true);
      expect(destructive._unsafeUnwrap()).toEqual({
        inspectedCount: 2,
        candidateCount: 1,
        prunedCount: 1,
        skippedCount: 1,
        countsByEventType: {
          "deployment.finished": 1,
        },
        skippedCountsByReason: {
          "recovery-readiness": 1,
        },
      });
      expect(remainingRows.map((row) => row.id)).toEqual([
        "des_cutoff_equal",
        "des_newer",
        "des_other_deployment",
        "des_recovery_guard",
      ]);
      expect(normalizedWatermarks).toEqual([
        {
          stream_scope: "deployment",
          stream_id: "dep_primary",
          pruned_before: "2026-01-01T00:05:00.000Z",
          last_pruned_cursor: "evt_001",
        },
      ]);
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });

  test("[DOMAIN-EVENT-RETENTION-005] replays retained deployment events and reports pruned cursor gaps", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-domain-event-stream-replay-"));
    const { createDatabase, createMigrator, PgDomainEventStreamRetentionStore } = await import(
      "../src"
    );
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      await seedDomainEventStreamRecord(database.db, {
        id: "des_replay_001",
        cursor: "evt_001",
        eventType: "deployment-started",
        deploymentId: "dep_primary",
        occurredAt: "2026-01-01T00:00:00.000Z",
        sourceKind: "domain-event",
        summary: "Deployment started",
        payload: {
          sequence: 1,
          phase: "deploy",
          status: "running",
        },
      });
      await seedDomainEventStreamRecord(database.db, {
        id: "des_replay_002",
        cursor: "evt_002",
        eventType: "deployment-succeeded",
        deploymentId: "dep_primary",
        occurredAt: "2026-01-01T00:01:00.000Z",
        sourceKind: "progress-projection",
        summary: "Deployment succeeded",
        payload: {
          sequence: 2,
          phase: "verify",
          status: "succeeded",
        },
      });

      const context = toRepositoryContext(
        createExecutionContext({
          requestId: "req_domain_event_stream_replay_pg_test",
          entrypoint: "system",
        }),
      );
      const store = new PgDomainEventStreamRetentionStore(database.db);
      const replay = await store.replayDeploymentEvents(context, {
        deploymentId: "dep_primary",
        historyLimit: 10,
        includeHistory: true,
        untilTerminal: true,
      });

      expect(replay.isOk()).toBe(true);
      expect(replay._unsafeUnwrap()).toMatchObject({
        available: true,
        envelopes: [
          {
            schemaVersion: "deployments.stream-events/v1",
            kind: "event",
            event: {
              deploymentId: "dep_primary",
              sequence: 1,
              cursor: "evt_001",
              source: "domain-event",
              eventType: "deployment-started",
              phase: "deploy",
              status: "running",
              summary: "Deployment started",
            },
          },
          {
            schemaVersion: "deployments.stream-events/v1",
            kind: "event",
            event: {
              deploymentId: "dep_primary",
              sequence: 2,
              cursor: "evt_002",
              source: "progress-projection",
              eventType: "deployment-succeeded",
              phase: "verify",
              status: "succeeded",
              summary: "Deployment succeeded",
            },
          },
          {
            schemaVersion: "deployments.stream-events/v1",
            kind: "closed",
            reason: "completed",
            cursor: "evt_002",
          },
        ],
      });

      const prune = await store.prune(context, {
        before: "2026-01-01T00:00:30.000Z",
        deploymentId: "dep_primary",
        dryRun: false,
      });
      expect(prune.isOk()).toBe(true);

      const gap = await store.replayDeploymentEvents(context, {
        deploymentId: "dep_primary",
        cursor: "evt_001",
        historyLimit: 10,
        includeHistory: true,
        untilTerminal: true,
      });

      expect(gap.isOk()).toBe(true);
      expect(gap._unsafeUnwrap()).toEqual({
        available: true,
        envelopes: [
          {
            schemaVersion: "deployments.stream-events/v1",
            kind: "gap",
            gap: {
              code: "deployment_event_stream_gap",
              phase: "event-replay",
              retriable: true,
              cursor: "evt_001",
              recommendedAction: "restart-stream",
            },
          },
        ],
      });
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });

  test("[DOMAIN-EVENT-RETENTION-005] opens retained deployment follow stream from stable cursor", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-domain-event-stream-follow-"));
    const { createDatabase, createMigrator, PgDomainEventStreamRetentionStore } = await import(
      "../src"
    );
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      await seedDomainEventStreamRecord(database.db, {
        id: "des_follow_001",
        cursor: "evt_001",
        eventType: "deployment-started",
        deploymentId: "dep_primary",
        occurredAt: "2026-01-01T00:00:00.000Z",
        sourceKind: "domain-event",
        summary: "Deployment started",
        payload: {
          sequence: 1,
          phase: "deploy",
          status: "running",
        },
      });
      await seedDomainEventStreamRecord(database.db, {
        id: "des_follow_002",
        cursor: "evt_002",
        eventType: "deployment-succeeded",
        deploymentId: "dep_primary",
        occurredAt: "2026-01-01T00:01:00.000Z",
        sourceKind: "domain-event",
        summary: "Deployment succeeded",
        payload: {
          sequence: 2,
          phase: "verify",
          status: "succeeded",
        },
      });

      const context = toRepositoryContext(
        createExecutionContext({
          requestId: "req_domain_event_stream_follow_pg_test",
          entrypoint: "system",
        }),
      );
      const store = new PgDomainEventStreamRetentionStore(database.db);
      const opened = await store.openDeploymentEventStream(
        context,
        {
          deploymentId: "dep_primary",
          cursor: "evt_001",
          historyLimit: 10,
          includeHistory: true,
          untilTerminal: true,
        },
        new AbortController().signal,
      );

      expect(opened.isOk()).toBe(true);
      const streamOrReplay = opened._unsafeUnwrap();
      expect("available" in streamOrReplay).toBe(false);

      if (!("available" in streamOrReplay)) {
        const envelopes = [];
        for await (const envelope of streamOrReplay) {
          envelopes.push(envelope);
        }

        expect(envelopes).toMatchObject([
          {
            schemaVersion: "deployments.stream-events/v1",
            kind: "event",
            event: {
              deploymentId: "dep_primary",
              sequence: 2,
              cursor: "evt_002",
              source: "domain-event",
              eventType: "deployment-succeeded",
              phase: "verify",
              status: "succeeded",
              summary: "Deployment succeeded",
            },
          },
          {
            schemaVersion: "deployments.stream-events/v1",
            kind: "closed",
            reason: "completed",
            cursor: "evt_002",
          },
        ]);
      }
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });

  test("[DOMAIN-EVENT-RETENTION-005] records published deployment domain events as retained stream rows", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-domain-event-stream-record-"));
    const { createDatabase, createMigrator, PgDomainEventStreamRetentionStore } = await import(
      "../src"
    );
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const context = toRepositoryContext(
        createExecutionContext({
          requestId: "req_domain_event_stream_record_pg_test",
          entrypoint: "system",
        }),
      );
      const store = new PgDomainEventStreamRetentionStore(database.db);
      const recordStarted = await store.record(context, {
        requestId: "req_domain_event_stream_record_pg_test",
        event: {
          type: "deployment.started",
          aggregateId: "dep_primary",
          occurredAt: "2026-01-01T00:00:00.000Z",
          payload: {
            triggerKind: "create",
          },
        },
      });
      const recordFinished = await store.record(context, {
        requestId: "req_domain_event_stream_record_pg_test",
        event: {
          type: "deployment.finished",
          aggregateId: "dep_primary",
          occurredAt: "2026-01-01T00:01:00.000Z",
          payload: {
            status: "succeeded",
            exitCode: 0,
            retryable: false,
          },
        },
      });
      await store.record(context, {
        requestId: "req_domain_event_stream_record_pg_test",
        event: {
          type: "project.created",
          aggregateId: "prj_ignored",
          occurredAt: "2026-01-01T00:02:00.000Z",
          payload: {},
        },
      });

      const rows = await database.db
        .selectFrom("domain_event_stream_records")
        .select([
          "stream_scope",
          "stream_id",
          "event_type",
          "source_kind",
          "aggregate_id",
          "aggregate_type",
          "deployment_id",
          "request_id",
          "summary",
        ])
        .orderBy("occurred_at", "asc")
        .execute();
      const replay = await store.replayDeploymentEvents(context, {
        deploymentId: "dep_primary",
        historyLimit: 10,
        includeHistory: true,
        untilTerminal: true,
      });

      expect(recordStarted.isOk()).toBe(true);
      expect(recordFinished.isOk()).toBe(true);
      expect(rows).toEqual([
        {
          stream_scope: "deployment",
          stream_id: "dep_primary",
          event_type: "deployment-started",
          source_kind: "domain-event",
          aggregate_id: "dep_primary",
          aggregate_type: "deployment",
          deployment_id: "dep_primary",
          request_id: "req_domain_event_stream_record_pg_test",
          summary: "Deployment started",
        },
        {
          stream_scope: "deployment",
          stream_id: "dep_primary",
          event_type: "deployment-succeeded",
          source_kind: "domain-event",
          aggregate_id: "dep_primary",
          aggregate_type: "deployment",
          deployment_id: "dep_primary",
          request_id: "req_domain_event_stream_record_pg_test",
          summary: "Deployment succeeded",
        },
      ]);
      expect(replay.isOk()).toBe(true);
      expect(replay._unsafeUnwrap()).toMatchObject({
        available: true,
        envelopes: [
          {
            kind: "event",
            event: {
              deploymentId: "dep_primary",
              source: "domain-event",
              eventType: "deployment-started",
              status: "running",
            },
          },
          {
            kind: "event",
            event: {
              deploymentId: "dep_primary",
              source: "domain-event",
              eventType: "deployment-succeeded",
              status: "succeeded",
            },
          },
          {
            kind: "closed",
            reason: "completed",
          },
        ],
      });
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });
});
