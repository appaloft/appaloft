import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";

function organizationContext(organizationId: string) {
  return toRepositoryContext(
    createExecutionContext({
      requestId: `req_retention_defaults_${organizationId}`,
      entrypoint: "system",
      principal: {
        kind: "user",
        actorId: `usr_${organizationId}`,
        userId: `usr_${organizationId}`,
        activeOrganization: {
          organizationId,
          role: "owner",
          productRole: "owner",
        },
      },
    }),
  );
}

describe("retention defaults persistence", () => {
  test("[ORG-RETENTION-DEFAULTS-001] [ORG-RETENTION-DEFAULTS-002] persists and reads safe defaults", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-retention-defaults-"));
    const { createDatabase, createMigrator, PgRetentionDefaultRepository } = await import("../src");
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
          requestId: "req_retention_defaults_persistence",
          entrypoint: "system",
        }),
      );
      const repository = new PgRetentionDefaultRepository(database.db);

      const first = await repository.upsert(context, {
        id: "rdf_domain_events",
        scope: "organization",
        organizationId: "org_primary",
        category: "domain-event-streams",
        retentionDays: 90,
        dryRunSchedulingEnabled: true,
        destructiveSchedulingEnabled: false,
        enabled: true,
        updatedAt: "2026-02-01T00:00:00.000Z",
        updatedByActorId: "usr_admin",
        updatedByActorKind: "user",
      });
      const second = await repository.upsert(context, {
        id: "rdf_domain_events",
        scope: "organization",
        organizationId: "org_primary",
        category: "domain-event-streams",
        retentionDays: 120,
        dryRunSchedulingEnabled: true,
        destructiveSchedulingEnabled: true,
        enabled: true,
        updatedAt: "2026-02-02T00:00:00.000Z",
        updatedByActorId: "usr_owner",
        updatedByActorKind: "user",
      });
      const disabled = await repository.upsert(context, {
        id: "rdf_disabled",
        scope: "system",
        category: "provider-job-logs",
        retentionDays: 30,
        dryRunSchedulingEnabled: true,
        destructiveSchedulingEnabled: false,
        enabled: false,
        updatedAt: "2026-02-03T00:00:00.000Z",
        updatedByActorId: "system",
        updatedByActorKind: "system",
      });

      expect(first.isOk()).toBe(true);
      expect(second.isOk()).toBe(true);
      expect(disabled.isOk()).toBe(true);

      const found = await repository.findOne(context, {
        scope: "organization",
        organizationId: "org_primary",
        category: "domain-event-streams",
      });
      expect(found.isOk()).toBe(true);
      expect(found._unsafeUnwrap()).toEqual({
        id: "rdf_domain_events",
        scope: "organization",
        organizationId: "org_primary",
        category: "domain-event-streams",
        retentionDays: 120,
        dryRunSchedulingEnabled: true,
        destructiveSchedulingEnabled: true,
        enabled: true,
        updatedAt: "2026-02-02T00:00:00.000Z",
        updatedByActorId: "usr_owner",
        updatedByActorKind: "user",
      });

      const all = await repository.list(context);
      const enabled = await repository.list(context, { enabledOnly: true });
      const orgPrimaryContext = organizationContext("org_primary");
      const orgOtherContext = organizationContext("org_other");
      const orgPrimaryVisible = await repository.list(orgPrimaryContext);
      const orgOtherVisible = await repository.list(orgOtherContext);
      const crossOrgFind = await repository.findOne(orgOtherContext, {
        scope: "organization",
        organizationId: "org_primary",
        category: "domain-event-streams",
      });
      const crossOrgWrite = await repository.upsert(orgOtherContext, {
        id: "rdf_cross_org",
        scope: "organization",
        organizationId: "org_primary",
        category: "domain-event-streams",
        retentionDays: 10,
        dryRunSchedulingEnabled: true,
        destructiveSchedulingEnabled: false,
        enabled: true,
        updatedAt: "2026-02-04T00:00:00.000Z",
      });

      expect(all.isOk()).toBe(true);
      expect(all._unsafeUnwrap().map((record) => record.id)).toEqual([
        "rdf_domain_events",
        "rdf_disabled",
      ]);
      expect(enabled.isOk()).toBe(true);
      expect(enabled._unsafeUnwrap().map((record) => record.id)).toEqual(["rdf_domain_events"]);
      expect(orgPrimaryVisible._unsafeUnwrap().map((record) => record.id)).toEqual([
        "rdf_domain_events",
        "rdf_disabled",
      ]);
      expect(orgOtherVisible._unsafeUnwrap().map((record) => record.id)).toEqual(["rdf_disabled"]);
      expect(crossOrgFind._unsafeUnwrap()).toBeNull();
      expect(crossOrgWrite.isErr()).toBe(true);
      expect(JSON.stringify(all._unsafeUnwrap())).not.toContain("PRIVATE_KEY");
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });
});
