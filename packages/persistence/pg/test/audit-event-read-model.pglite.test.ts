import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";

describe("audit event read model persistence", () => {
  test("[AUDIT-EVENT-PG-001][AUDIT-EVENT-PG-002] lists retained events and redacts detail payloads", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-audit-events-"));
    const { createDatabase, createMigrator, PgAuditEventReadModel } = await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      await database.db
        .insertInto("audit_logs")
        .values([
          {
            id: "aud_res_old",
            aggregate_id: "res_web",
            event_type: "resource-created",
            payload: {
              name: "Web",
            },
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "aud_res_new",
            aggregate_id: "res_web",
            event_type: "resource-variable-set",
            payload: {
              key: "DATABASE_URL",
              value: "postgres://user:password@example/db",
              privateKey: "-----BEGIN PRIVATE KEY-----",
              providerPayload: {
                raw: "unsafe",
              },
              changedFields: ["key", "value"],
              count: 2,
            },
            created_at: "2026-01-01T00:00:10.000Z",
          },
          {
            id: "aud_srv_other",
            aggregate_id: "srv_other",
            event_type: "server-renamed",
            payload: {
              name: "Server",
            },
            created_at: "2026-01-01T00:00:20.000Z",
          },
        ])
        .execute();

      const context = toRepositoryContext(
        createExecutionContext({
          requestId: "req_audit_event_pg_test",
          entrypoint: "system",
        }),
      );
      const readModel = new PgAuditEventReadModel(database.db);

      const listed = await readModel.list(context, {
        aggregateId: "res_web",
        eventType: "resource-variable-set",
      });
      const detail = await readModel.findOne(context, {
        auditEventId: "aud_res_new",
        aggregateId: "res_web",
      });
      const exported = await readModel.export(context, {
        aggregateId: "res_web",
        eventType: "resource-variable-set",
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-01T00:01:00.000Z",
        limit: 1,
      });
      const mismatch = await readModel.findOne(context, {
        auditEventId: "aud_res_new",
        aggregateId: "srv_other",
      });

      expect(listed).toEqual({
        items: [
          {
            auditEventId: "aud_res_new",
            aggregateId: "res_web",
            eventType: "resource-variable-set",
            createdAt: "2026-01-01T00:00:10.000Z",
          },
        ],
      });
      expect(detail).toEqual({
        auditEventId: "aud_res_new",
        aggregateId: "res_web",
        eventType: "resource-variable-set",
        payload: {
          key: "DATABASE_URL",
          value: "[redacted]",
          privateKey: "[redacted]",
          providerPayload: "[redacted]",
          changedFields: ["key", "value"],
          count: 2,
        },
        redactedFields: ["value", "privateKey", "providerPayload"],
        createdAt: "2026-01-01T00:00:10.000Z",
      });
      expect(exported).toEqual({
        items: [
          {
            auditEventId: "aud_res_new",
            aggregateId: "res_web",
            eventType: "resource-variable-set",
            payload: {
              key: "DATABASE_URL",
              value: "[redacted]",
              privateKey: "[redacted]",
              providerPayload: "[redacted]",
              changedFields: ["key", "value"],
              count: 2,
            },
            redactedFields: ["value", "privateKey", "providerPayload"],
            createdAt: "2026-01-01T00:00:10.000Z",
          },
        ],
        truncated: false,
      });
      expect(mismatch).toBeNull();
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });

  test("[AUDIT-EVENT-GLOBAL-EXPORT-003] filters operation audit payload fields", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-audit-global-filters-"));
    const { createDatabase, createMigrator, PgAuditEventReadModel } = await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      await database.db
        .insertInto("audit_logs")
        .values([
          {
            id: "aud_project_match",
            aggregate_id: "prj_1",
            event_type: "projects.create",
            payload: {
              schemaVersion: "operation-audit/v1",
              organizationId: "org_1",
              action: "create",
              resourceType: "project",
              resourceId: "prj_1",
              projectId: "prj_1",
              actorId: "usr_1",
              result: "success",
            },
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "aud_project_other_actor",
            aggregate_id: "prj_2",
            event_type: "projects.create",
            payload: {
              schemaVersion: "operation-audit/v1",
              organizationId: "org_1",
              action: "create",
              resourceType: "project",
              resourceId: "prj_2",
              actorId: "usr_2",
              result: "success",
            },
            created_at: "2026-01-01T00:00:01.000Z",
          },
          {
            id: "aud_resource_other_type",
            aggregate_id: "res_1",
            event_type: "resources.create",
            payload: {
              schemaVersion: "operation-audit/v1",
              organizationId: "org_1",
              action: "create",
              resourceType: "resource",
              resourceId: "res_1",
              projectId: "prj_1",
              actorId: "usr_1",
              result: "success",
            },
            created_at: "2026-01-01T00:00:02.000Z",
          },
          {
            id: "aud_project_other_org",
            aggregate_id: "prj_3",
            event_type: "projects.create",
            payload: {
              schemaVersion: "operation-audit/v1",
              organizationId: "org_2",
              action: "create",
              resourceType: "project",
              resourceId: "prj_3",
              actorId: "usr_1",
              result: "success",
            },
            created_at: "2026-01-01T00:00:03.000Z",
          },
        ])
        .execute();

      const context = toRepositoryContext(
        createExecutionContext({
          requestId: "req_audit_event_global_filter_pg_test",
          entrypoint: "system",
        }),
      );
      const readModel = new PgAuditEventReadModel(database.db);

      const exported = await readModel.exportGlobal(context, {
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-01T00:01:00.000Z",
        organizationId: "org_1",
        action: "create",
        resourceType: "project",
        actorId: "usr_1",
        limit: 10,
      });

      expect(exported.items.map((event) => event.auditEventId)).toEqual(["aud_project_match"]);

      const multiValueExported = await readModel.exportGlobal(context, {
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-01T00:01:00.000Z",
        organizationId: "org_1",
        action: ["create"],
        resourceType: ["project", "resource"],
        actorId: ["usr_1", "usr_2"],
        limit: 10,
      });

      expect(multiValueExported.items.map((event) => event.auditEventId)).toEqual([
        "aud_project_match",
        "aud_project_other_actor",
        "aud_resource_other_type",
      ]);

      const projectScoped = await readModel.exportGlobal(context, {
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-01T00:01:00.000Z",
        organizationId: "org_1",
        projectId: "prj_1",
        limit: 10,
      });

      expect(projectScoped.items.map((event) => event.auditEventId)).toEqual([
        "aud_project_match",
        "aud_resource_other_type",
      ]);

      const pagedDescending = await readModel.exportGlobal(context, {
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-01T00:01:00.000Z",
        organizationId: "org_1",
        action: ["create"],
        resourceType: ["project", "resource"],
        actorId: ["usr_1", "usr_2"],
        order: "desc",
        limit: 2,
      });

      expect(pagedDescending.items.map((event) => event.auditEventId)).toEqual([
        "aud_resource_other_type",
        "aud_project_other_actor",
      ]);
      expect(pagedDescending.nextCursor).toBe(
        "2026-01-01T00:00:01.000Z|aud_project_other_actor",
      );
      expect(pagedDescending.truncated).toBe(true);

      const pagedDescendingNext = await readModel.exportGlobal(context, {
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-01T00:01:00.000Z",
        organizationId: "org_1",
        action: ["create"],
        resourceType: ["project", "resource"],
        actorId: ["usr_1", "usr_2"],
        order: "desc",
        cursor: pagedDescending.nextCursor ?? "",
        limit: 2,
      });

      expect(pagedDescendingNext.items.map((event) => event.auditEventId)).toEqual([
        "aud_project_match",
      ]);
      expect(pagedDescendingNext.nextCursor).toBeUndefined();
      expect(pagedDescendingNext.truncated).toBe(false);
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });

  test("[AUDIT-EVENT-EXPORT-002] exports bounded redacted events with truncation metadata", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-audit-export-"));
    const { createDatabase, createMigrator, PgAuditEventReadModel } = await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      await database.db
        .insertInto("audit_logs")
        .values([
          {
            id: "aud_before_range",
            aggregate_id: "res_web",
            event_type: "resource-variable-set",
            payload: { key: "BEFORE", value: "secret-before" },
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "aud_first_match",
            aggregate_id: "res_web",
            event_type: "resource-variable-set",
            payload: {
              key: "DATABASE_URL",
              value: "postgres://user:password@example/db",
              note: "first",
            },
            created_at: "2026-01-01T00:01:00.000Z",
          },
          {
            id: "aud_second_match",
            aggregate_id: "res_web",
            event_type: "resource-variable-set",
            payload: {
              key: "API_TOKEN",
              value: "token-value",
              note: "second",
            },
            created_at: "2026-01-01T00:02:00.000Z",
          },
          {
            id: "aud_other_event",
            aggregate_id: "res_web",
            event_type: "resource-created",
            payload: { name: "Web" },
            created_at: "2026-01-01T00:01:30.000Z",
          },
          {
            id: "aud_other_aggregate",
            aggregate_id: "srv_primary",
            event_type: "resource-variable-set",
            payload: { key: "DATABASE_URL", value: "other-secret" },
            created_at: "2026-01-01T00:01:30.000Z",
          },
          {
            id: "aud_to_exclusive",
            aggregate_id: "res_web",
            event_type: "resource-variable-set",
            payload: { key: "TO_EXCLUSIVE", value: "secret-to" },
            created_at: "2026-01-01T00:03:00.000Z",
          },
        ])
        .execute();

      const context = toRepositoryContext(
        createExecutionContext({
          requestId: "req_audit_event_export_pg_test",
          entrypoint: "system",
        }),
      );
      const readModel = new PgAuditEventReadModel(database.db);

      const exported = await readModel.export(context, {
        aggregateId: "res_web",
        eventType: "resource-variable-set",
        from: "2026-01-01T00:01:00.000Z",
        to: "2026-01-01T00:03:00.000Z",
        limit: 1,
      });

      expect(exported).toEqual({
        items: [
          {
            auditEventId: "aud_first_match",
            aggregateId: "res_web",
            eventType: "resource-variable-set",
            payload: {
              key: "DATABASE_URL",
              value: "[redacted]",
              note: "first",
            },
            redactedFields: ["value"],
            createdAt: "2026-01-01T00:01:00.000Z",
          },
        ],
        truncated: true,
      });
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });

  test("[AUDIT-EVENT-GLOBAL-EXPORT-002][AUDIT-EVENT-GLOBAL-EXPORT-003] exports bounded global audit events with filters", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-audit-global-export-"));
    const { createDatabase, createMigrator, PgAuditEventReadModel } = await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      await database.db
        .insertInto("audit_logs")
        .values([
          {
            id: "aud_before_range",
            aggregate_id: "res_web",
            event_type: "resource-variable-set",
            payload: { key: "BEFORE", value: "secret-before" },
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "aud_first_match",
            aggregate_id: "res_web",
            event_type: "resource-variable-set",
            payload: {
              key: "DATABASE_URL",
              value: "postgres://user:password@example/db",
              note: "first",
            },
            created_at: "2026-01-01T00:01:00.000Z",
          },
          {
            id: "aud_second_match",
            aggregate_id: "srv_primary",
            event_type: "resource-variable-set",
            payload: {
              key: "API_TOKEN",
              value: "token-value",
              note: "second",
            },
            created_at: "2026-01-01T00:01:30.000Z",
          },
          {
            id: "aud_other_event",
            aggregate_id: "res_web",
            event_type: "resource-created",
            payload: { name: "Web" },
            created_at: "2026-01-01T00:02:00.000Z",
          },
          {
            id: "aud_to_exclusive",
            aggregate_id: "srv_primary",
            event_type: "resource-variable-set",
            payload: { key: "TO_EXCLUSIVE", value: "secret-to" },
            created_at: "2026-01-01T00:03:00.000Z",
          },
        ])
        .execute();

      const context = toRepositoryContext(
        createExecutionContext({
          requestId: "req_audit_event_global_export_pg_test",
          entrypoint: "system",
        }),
      );
      const readModel = new PgAuditEventReadModel(database.db);

      const exported = await readModel.exportGlobal(context, {
        from: "2026-01-01T00:01:00.000Z",
        to: "2026-01-01T00:03:00.000Z",
        eventType: "resource-variable-set",
        limit: 1,
      });
      const narrowed = await readModel.exportGlobal(context, {
        from: "2026-01-01T00:01:00.000Z",
        to: "2026-01-01T00:03:00.000Z",
        aggregateId: "res_web",
        eventType: "resource-created",
        limit: 10,
      });

      expect(exported).toEqual({
        items: [
          {
            auditEventId: "aud_first_match",
            aggregateId: "res_web",
            eventType: "resource-variable-set",
            payload: {
              key: "DATABASE_URL",
              value: "[redacted]",
              note: "first",
            },
            redactedFields: ["value"],
            createdAt: "2026-01-01T00:01:00.000Z",
          },
        ],
        nextCursor: "2026-01-01T00:01:00.000Z|aud_first_match",
        truncated: true,
      });
      expect(narrowed).toEqual({
        items: [
          {
            auditEventId: "aud_other_event",
            aggregateId: "res_web",
            eventType: "resource-created",
            payload: { name: "Web" },
            redactedFields: [],
            createdAt: "2026-01-01T00:02:00.000Z",
          },
        ],
        truncated: false,
      });
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });

  test("[AUDIT-EVENT-PRUNE-003] prunes old audit rows while retaining cutoff-equal and out-of-scope rows", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-audit-prune-"));
    const { createDatabase, createMigrator, PgAuditEventReadModel } = await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      await database.db
        .insertInto("audit_logs")
        .values([
          {
            id: "aud_old_match",
            aggregate_id: "res_web",
            event_type: "resource-variable-set",
            payload: { key: "DATABASE_URL" },
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "aud_cutoff_equal",
            aggregate_id: "res_web",
            event_type: "resource-variable-set",
            payload: { key: "PORT" },
            created_at: "2026-01-01T00:05:00.000Z",
          },
          {
            id: "aud_other_event",
            aggregate_id: "res_web",
            event_type: "resource-created",
            payload: { name: "Web" },
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "aud_other_aggregate",
            aggregate_id: "srv_primary",
            event_type: "server-renamed",
            payload: { name: "Primary" },
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ])
        .execute();

      const context = toRepositoryContext(
        createExecutionContext({
          requestId: "req_audit_event_prune_pg_test",
          entrypoint: "system",
        }),
      );
      const readModel = new PgAuditEventReadModel(database.db);

      const dryRun = await readModel.prune(context, {
        before: "2026-01-01T00:05:00.000Z",
        aggregateId: "res_web",
        eventType: "resource-variable-set",
        dryRun: true,
      });
      const afterDryRunRows = await database.db
        .selectFrom("audit_logs")
        .select("id")
        .orderBy("id")
        .execute();
      const destructive = await readModel.prune(context, {
        before: "2026-01-01T00:05:00.000Z",
        aggregateId: "res_web",
        eventType: "resource-variable-set",
        dryRun: false,
      });
      const remainingRows = await database.db
        .selectFrom("audit_logs")
        .select("id")
        .orderBy("id")
        .execute();

      expect(dryRun.isOk()).toBe(true);
      expect(dryRun._unsafeUnwrap()).toEqual({
        matchedCount: 1,
        prunedCount: 0,
        heldCount: 0,
        archiveRetainedCount: 0,
        countsByEventType: {
          "resource-variable-set": 1,
        },
        heldCountsByEventType: {},
        archiveRetainedCountsByEventType: {},
        activeHoldIds: [],
        activeArchiveIds: [],
      });
      expect(afterDryRunRows.map((row) => row.id)).toEqual([
        "aud_cutoff_equal",
        "aud_old_match",
        "aud_other_aggregate",
        "aud_other_event",
      ]);
      expect(destructive.isOk()).toBe(true);
      expect(destructive._unsafeUnwrap()).toEqual({
        matchedCount: 1,
        prunedCount: 1,
        heldCount: 0,
        archiveRetainedCount: 0,
        countsByEventType: {
          "resource-variable-set": 1,
        },
        heldCountsByEventType: {},
        archiveRetainedCountsByEventType: {},
        activeHoldIds: [],
        activeArchiveIds: [],
      });
      expect(remainingRows.map((row) => row.id)).toEqual([
        "aud_cutoff_equal",
        "aud_other_aggregate",
        "aud_other_event",
      ]);
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });

  test("[RT-CAP-PRUNE-006] records destructive runtime prune audit rows with redacted readback", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-audit-record-"));
    const { createDatabase, createMigrator, PgAuditEventReadModel } = await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const context = toRepositoryContext(
        createExecutionContext({
          requestId: "req_runtime_prune_audit_pg_test",
          entrypoint: "system",
        }),
      );
      const auditEvents = new PgAuditEventReadModel(database.db);

      const recorded = await auditEvents.record(context, {
        id: "aud_runtime_prune",
        aggregateId: "srv_primary",
        eventType: "server-capacity-pruned",
        payload: {
          operationKey: "servers.capacity.prune",
          serverId: "srv_primary",
          before: "2026-01-01T00:05:00.000Z",
          categories: ["stopped-containers", "source-workspaces"],
          matchedCount: 2,
          prunedCount: 2,
          reclaimedBytes: 2048,
          prunedAt: "2026-01-01T00:10:00.000Z",
        },
        createdAt: "2026-01-01T00:11:00.000Z",
      });
      const listed = await auditEvents.list(context, {
        aggregateId: "srv_primary",
        eventType: "server-capacity-pruned",
      });
      const detail = await auditEvents.findOne(context, {
        auditEventId: "aud_runtime_prune",
        aggregateId: "srv_primary",
      });

      expect(recorded.isOk()).toBe(true);
      expect(listed).toEqual({
        items: [
          {
            auditEventId: "aud_runtime_prune",
            aggregateId: "srv_primary",
            eventType: "server-capacity-pruned",
            createdAt: "2026-01-01T00:11:00.000Z",
          },
        ],
      });
      expect(detail).toEqual({
        auditEventId: "aud_runtime_prune",
        aggregateId: "srv_primary",
        eventType: "server-capacity-pruned",
        payload: {
          operationKey: "servers.capacity.prune",
          serverId: "srv_primary",
          before: "2026-01-01T00:05:00.000Z",
          categories: ["stopped-containers", "source-workspaces"],
          matchedCount: 2,
          prunedCount: 2,
          reclaimedBytes: 2048,
          prunedAt: "2026-01-01T00:10:00.000Z",
        },
        redactedFields: [],
        createdAt: "2026-01-01T00:11:00.000Z",
      });
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });

  test("[AUDIT-EVENT-HOLD-001][AUDIT-EVENT-HOLD-002][AUDIT-EVENT-HOLD-004][AUDIT-EVENT-HOLD-005] persists safe legal hold readback and release", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-audit-holds-"));
    const { createDatabase, createMigrator, PgAuditEventLegalHoldStore } = await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const context = toRepositoryContext(
        createExecutionContext({
          requestId: "req_audit_event_hold_pg_test",
          entrypoint: "system",
        }),
      );
      const store = new PgAuditEventLegalHoldStore(database.db);

      const aggregate = await store.configure(context, {
        holdId: "ahl_res_web",
        aggregateId: "res_web",
        eventType: "resource-variable-set",
        reason: "support incident",
        requestedBy: "operator@example.com",
        createdAt: "2026-01-01T00:10:00.000Z",
      });
      const global = await store.configure(context, {
        holdId: "ahl_global_window",
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-01T00:05:00.000Z",
        reason: "incident window",
        createdAt: "2026-01-01T00:11:00.000Z",
      });
      const activeList = await store.list(context, { status: "active", limit: 10 });
      const released = await store.release(context, {
        holdId: "ahl_res_web",
        releaseReason: "case closed",
        releasedBy: "operator@example.com",
        releasedAt: "2026-01-01T00:12:00.000Z",
      });
      const shown = await store.findOne(context, "ahl_res_web");

      expect(aggregate.isOk()).toBe(true);
      expect(aggregate._unsafeUnwrap()).toEqual({
        holdId: "ahl_res_web",
        status: "active",
        scope: {
          kind: "aggregate",
          aggregateId: "res_web",
        },
        eventType: "resource-variable-set",
        reason: "support incident",
        requestedBy: "operator@example.com",
        createdAt: "2026-01-01T00:10:00.000Z",
      });
      expect(global.isOk()).toBe(true);
      expect(global._unsafeUnwrap().scope).toEqual({
        kind: "global-window",
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-01T00:05:00.000Z",
      });
      expect(activeList.isOk()).toBe(true);
      expect(activeList._unsafeUnwrap().items.map((hold) => hold.holdId)).toEqual([
        "ahl_global_window",
        "ahl_res_web",
      ]);
      expect(released.isOk()).toBe(true);
      expect(released._unsafeUnwrap()).toMatchObject({
        holdId: "ahl_res_web",
        status: "released",
        releasedAt: "2026-01-01T00:12:00.000Z",
        releaseReason: "case closed",
        releasedBy: "operator@example.com",
      });
      expect(shown.isOk()).toBe(true);
      expect(shown._unsafeUnwrap()).toMatchObject({
        holdId: "ahl_res_web",
        status: "released",
      });
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });

  test("[AUDIT-EVENT-HOLD-003][AUDIT-EVENT-HOLD-005] skips active legal holds during dry-run and destructive prune", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-audit-hold-prune-"));
    const { createDatabase, createMigrator, PgAuditEventLegalHoldStore, PgAuditEventReadModel } =
      await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      await database.db
        .insertInto("audit_logs")
        .values([
          {
            id: "aud_held_aggregate",
            aggregate_id: "res_web",
            event_type: "resource-variable-set",
            payload: { key: "DATABASE_URL" },
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "aud_held_global",
            aggregate_id: "srv_primary",
            event_type: "server-renamed",
            payload: { name: "Primary" },
            created_at: "2026-01-01T00:02:00.000Z",
          },
          {
            id: "aud_unheld",
            aggregate_id: "res_api",
            event_type: "resource-created",
            payload: { name: "API" },
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ])
        .execute();

      const context = toRepositoryContext(
        createExecutionContext({
          requestId: "req_audit_event_hold_prune_pg_test",
          entrypoint: "system",
        }),
      );
      const holds = new PgAuditEventLegalHoldStore(database.db);
      await holds.configure(context, {
        holdId: "ahl_res_web",
        aggregateId: "res_web",
        eventType: "resource-variable-set",
        reason: "support incident",
        createdAt: "2026-01-01T00:10:00.000Z",
      });
      await holds.configure(context, {
        holdId: "ahl_global_window",
        from: "2026-01-01T00:01:00.000Z",
        to: "2026-01-01T00:03:00.000Z",
        reason: "incident window",
        createdAt: "2026-01-01T00:11:00.000Z",
      });
      const readModel = new PgAuditEventReadModel(database.db);

      const dryRun = await readModel.prune(context, {
        before: "2026-01-01T00:05:00.000Z",
        dryRun: true,
      });
      const destructive = await readModel.prune(context, {
        before: "2026-01-01T00:05:00.000Z",
        dryRun: false,
      });
      const remainingBeforeRelease = await database.db
        .selectFrom("audit_logs")
        .select("id")
        .orderBy("id")
        .execute();
      await holds.release(context, {
        holdId: "ahl_res_web",
        releaseReason: "case closed",
        releasedAt: "2026-01-01T00:12:00.000Z",
      });
      const afterRelease = await readModel.prune(context, {
        before: "2026-01-01T00:05:00.000Z",
        dryRun: false,
      });
      const remainingAfterRelease = await database.db
        .selectFrom("audit_logs")
        .select("id")
        .orderBy("id")
        .execute();

      expect(dryRun.isOk()).toBe(true);
      expect(dryRun._unsafeUnwrap()).toEqual({
        matchedCount: 3,
        prunedCount: 0,
        heldCount: 2,
        archiveRetainedCount: 0,
        countsByEventType: {
          "resource-created": 1,
        },
        heldCountsByEventType: {
          "resource-variable-set": 1,
          "server-renamed": 1,
        },
        archiveRetainedCountsByEventType: {},
        activeHoldIds: ["ahl_global_window", "ahl_res_web"],
        activeArchiveIds: [],
      });
      expect(destructive.isOk()).toBe(true);
      expect(destructive._unsafeUnwrap()).toMatchObject({
        matchedCount: 3,
        prunedCount: 1,
        heldCount: 2,
        archiveRetainedCount: 0,
      });
      expect(remainingBeforeRelease.map((row) => row.id)).toEqual([
        "aud_held_aggregate",
        "aud_held_global",
      ]);
      expect(afterRelease.isOk()).toBe(true);
      expect(afterRelease._unsafeUnwrap()).toMatchObject({
        matchedCount: 2,
        prunedCount: 1,
        heldCount: 1,
        archiveRetainedCount: 0,
      });
      expect(remainingAfterRelease.map((row) => row.id)).toEqual(["aud_held_global"]);
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });

  test("[AUDIT-EVENT-ARCHIVE-001][AUDIT-EVENT-ARCHIVE-003][AUDIT-EVENT-ARCHIVE-004] persists archive readback and prunes archives only", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-audit-archives-"));
    const { createDatabase, createMigrator, PgAuditEventArchiveStore } = await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const context = toRepositoryContext(
        createExecutionContext({
          requestId: "req_audit_event_archive_pg_test",
          entrypoint: "system",
        }),
      );
      const store = new PgAuditEventArchiveStore(database.db);

      const created = await store.create(context, {
        archiveId: "aar_res_web",
        source: { kind: "aggregate", aggregateId: "res_web" },
        eventType: "resource-variable-set",
        reason: "support incident",
        items: [
          {
            auditEventId: "aud_res_new",
            aggregateId: "res_web",
            eventType: "resource-variable-set",
            payload: {
              key: "DATABASE_URL",
              value: "[redacted]",
            },
            redactedFields: ["value"],
            createdAt: "2026-01-01T00:00:10.000Z",
          },
        ],
        truncated: false,
        contentDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        retainSourceRows: true,
        createdAt: "2026-01-01T00:10:00.000Z",
      });
      const listed = await store.list(context, { aggregateId: "res_web", limit: 10 });
      const shown = await store.findOne(context, "aar_res_web");
      const dryRun = await store.prune(context, {
        before: "2026-01-01T00:11:00.000Z",
        dryRun: true,
      });
      const destructive = await store.prune(context, {
        before: "2026-01-01T00:11:00.000Z",
        dryRun: false,
      });
      const missing = await store.findOne(context, "aar_res_web");

      expect(created.isOk()).toBe(true);
      expect(created._unsafeUnwrap()).toEqual({
        archiveId: "aar_res_web",
        archiveSchemaVersion: "audit-events.archive/v1",
        source: { kind: "aggregate", aggregateId: "res_web" },
        eventType: "resource-variable-set",
        reason: "support incident",
        itemCount: 1,
        truncated: false,
        contentDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        retainSourceRows: true,
        createdAt: "2026-01-01T00:10:00.000Z",
      });
      expect(listed.isOk()).toBe(true);
      expect(listed._unsafeUnwrap().items).toEqual([created._unsafeUnwrap()]);
      expect(shown.isOk()).toBe(true);
      expect(shown._unsafeUnwrap()?.items).toEqual([
        {
          auditEventId: "aud_res_new",
          aggregateId: "res_web",
          eventType: "resource-variable-set",
          payload: {
            key: "DATABASE_URL",
            value: "[redacted]",
          },
          redactedFields: ["value"],
          createdAt: "2026-01-01T00:00:10.000Z",
        },
      ]);
      expect(dryRun.isOk()).toBe(true);
      expect(dryRun._unsafeUnwrap()).toEqual({
        matchedCount: 1,
        prunedCount: 0,
        countsBySourceKind: { aggregate: 1 },
        countsByEventType: { "resource-variable-set": 1 },
      });
      expect(destructive.isOk()).toBe(true);
      expect(destructive._unsafeUnwrap()).toMatchObject({
        matchedCount: 1,
        prunedCount: 1,
      });
      expect(missing.isOk()).toBe(true);
      expect(missing._unsafeUnwrap()).toBeNull();
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });

  test("[AUDIT-EVENT-ARCHIVE-005] skips source audit rows retained by archives", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-audit-archive-prune-"));
    const { createDatabase, createMigrator, PgAuditEventArchiveStore, PgAuditEventReadModel } =
      await import("../src");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      await database.db
        .insertInto("audit_logs")
        .values([
          {
            id: "aud_archive_retained",
            aggregate_id: "res_web",
            event_type: "resource-variable-set",
            payload: { key: "DATABASE_URL" },
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "aud_prunable",
            aggregate_id: "srv_primary",
            event_type: "server-renamed",
            payload: { name: "Primary" },
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ])
        .execute();

      const context = toRepositoryContext(
        createExecutionContext({
          requestId: "req_audit_event_archive_source_retention_pg_test",
          entrypoint: "system",
        }),
      );
      const archives = new PgAuditEventArchiveStore(database.db);
      await archives.create(context, {
        archiveId: "aar_retained",
        source: { kind: "aggregate", aggregateId: "res_web" },
        reason: "retain source row",
        items: [
          {
            auditEventId: "aud_archive_retained",
            aggregateId: "res_web",
            eventType: "resource-variable-set",
            payload: { key: "DATABASE_URL" },
            redactedFields: [],
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        truncated: false,
        contentDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        retainSourceRows: true,
        createdAt: "2026-01-01T00:02:00.000Z",
      });
      const readModel = new PgAuditEventReadModel(database.db);

      const destructive = await readModel.prune(context, {
        before: "2026-01-01T00:05:00.000Z",
        dryRun: false,
      });
      const remainingRows = await database.db
        .selectFrom("audit_logs")
        .select("id")
        .orderBy("id")
        .execute();
      await archives.prune(context, {
        before: "2026-01-01T00:05:00.000Z",
        dryRun: false,
      });
      const afterArchivePrune = await readModel.prune(context, {
        before: "2026-01-01T00:05:00.000Z",
        dryRun: false,
      });

      expect(destructive.isOk()).toBe(true);
      expect(destructive._unsafeUnwrap()).toEqual({
        matchedCount: 2,
        prunedCount: 1,
        heldCount: 0,
        archiveRetainedCount: 1,
        countsByEventType: {
          "server-renamed": 1,
        },
        heldCountsByEventType: {},
        archiveRetainedCountsByEventType: {
          "resource-variable-set": 1,
        },
        activeHoldIds: [],
        activeArchiveIds: ["aar_retained"],
      });
      expect(remainingRows.map((row) => row.id)).toEqual(["aud_archive_retained"]);
      expect(afterArchivePrune.isOk()).toBe(true);
      expect(afterArchivePrune._unsafeUnwrap()).toMatchObject({
        matchedCount: 1,
        prunedCount: 1,
        archiveRetainedCount: 0,
      });
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });
});
