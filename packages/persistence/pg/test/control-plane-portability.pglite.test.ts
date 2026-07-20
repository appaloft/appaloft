import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import { sql } from "kysely";

import { createDatabase, createMigrator, PgControlPlanePortabilityService } from "../src";

const passphrase = "correct horse battery staple";
const context = toRepositoryContext(
  createExecutionContext({
    requestId: "req_control_plane_portability_test",
    entrypoint: "system",
    actor: { kind: "system", id: "test", label: "test" },
  }),
);

async function withDatabase(
  run: (input: {
    database: Awaited<ReturnType<typeof createDatabase>>;
    service: PgControlPlanePortabilityService;
  }) => Promise<void>,
): Promise<void> {
  const dataDir = mkdtempSync(join(tmpdir(), "appaloft-control-plane-portability-"));
  const database = await createDatabase({ driver: "pglite", pgliteDataDir: dataDir });
  try {
    const migrated = await createMigrator(database.db).migrateToLatest();
    expect(migrated.error).toBeUndefined();
    await sql`CREATE TABLE portability_fixture (id text PRIMARY KEY, secret text NOT NULL)`.execute(
      database.db,
    );
    await run({ database, service: new PgControlPlanePortabilityService(database.db) });
  } finally {
    await database.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
}

describe("control-plane portability persistence", () => {
  test("[CP-PORT-PLAN-001][CP-PORT-CRYPTO-002] plans safely and encrypts all snapshot rows", () =>
    withDatabase(async ({ database, service }) => {
      await sql`INSERT INTO portability_fixture (id, secret) VALUES ('fixture-a', 'plaintext-secret-marker')`.execute(
        database.db,
      );

      const plan = await service.planExport(context);
      expect(plan.isOk()).toBe(true);
      expect(plan._unsafeUnwrap().tables).toContainEqual({
        name: "portability_fixture",
        rowCount: 1,
      });

      const exported = await service.export(context, { passphrase });
      expect(exported.isOk()).toBe(true);
      expect(exported._unsafeUnwrap().encryptedEnvelope).not.toContain("plaintext-secret-marker");
      expect(exported._unsafeUnwrap().artifact.checksum).toStartWith("sha256:");

      const wrongPassphrase = await service.planImport(context, {
        encryptedEnvelope: exported._unsafeUnwrap().encryptedEnvelope,
        passphrase: "incorrect passphrase value",
        mode: "merge",
      });
      expect(wrongPassphrase.isErr()).toBe(true);
      expect(wrongPassphrase._unsafeUnwrapErr().details?.causeCode).toBe(
        "passphrase-or-envelope-invalid",
      );
    }));

  test("[CP-PORT-MERGE-003][CP-PORT-REPLACE-004][CP-PORT-CLEANUP-006] imports merge/replace and deletes only the selected artifact", () =>
    withDatabase(async ({ database, service }) => {
      await sql`INSERT INTO portability_fixture (id, secret) VALUES ('fixture-a', 'source-value')`.execute(
        database.db,
      );
      const exported = (await service.export(context, { passphrase }))._unsafeUnwrap();

      await sql`UPDATE portability_fixture SET secret = 'target-value' WHERE id = 'fixture-a'`.execute(
        database.db,
      );
      await sql`INSERT INTO portability_fixture (id, secret) VALUES ('fixture-b', 'target-only')`.execute(
        database.db,
      );
      const mergePlan = (
        await service.planImport(context, {
          encryptedEnvelope: exported.encryptedEnvelope,
          passphrase,
          mode: "merge",
        })
      )._unsafeUnwrap();
      expect(mergePlan.compatible).toBe(true);

      const merged = (
        await service.importControlPlane(context, {
          encryptedEnvelope: exported.encryptedEnvelope,
          passphrase,
          mode: "merge",
          acknowledgeReplace: false,
        })
      )._unsafeUnwrap();
      expect(merged.updatedRows).toBeGreaterThanOrEqual(1);
      const afterMerge = await sql<{
        id: string;
        secret: string;
      }>`SELECT id, secret FROM portability_fixture ORDER BY id`.execute(database.db);
      expect(afterMerge.rows).toEqual([
        { id: "fixture-a", secret: "source-value" },
        { id: "fixture-b", secret: "target-only" },
      ]);

      const notAcknowledged = await service.importControlPlane(context, {
        encryptedEnvelope: exported.encryptedEnvelope,
        passphrase,
        mode: "replace",
        acknowledgeReplace: false,
      });
      expect(notAcknowledged.isErr()).toBe(true);

      const replaced = await service.importControlPlane(context, {
        encryptedEnvelope: exported.encryptedEnvelope,
        passphrase,
        mode: "replace",
        acknowledgeReplace: true,
      });
      expect(replaced.isOk()).toBe(true);
      const afterReplace = await sql<{
        id: string;
        secret: string;
      }>`SELECT id, secret FROM portability_fixture ORDER BY id`.execute(database.db);
      expect(afterReplace.rows).toEqual([{ id: "fixture-a", secret: "source-value" }]);

      const beforeDelete = (await service.listArtifacts(context))._unsafeUnwrap();
      expect(beforeDelete.length).toBeGreaterThanOrEqual(3);
      const deleted = await service.deleteArtifact(context, exported.artifact.id);
      expect(deleted.isOk()).toBe(true);
      const afterDelete = (await service.listArtifacts(context))._unsafeUnwrap();
      expect(afterDelete.some((item) => item.id === exported.artifact.id)).toBe(false);
      expect(afterDelete.length).toBe(beforeDelete.length - 1);
    }));

  test("[CP-PORT-ROLLBACK-005] leaves target rows unchanged and keeps a rollback artifact when apply fails", () =>
    withDatabase(async ({ database, service }) => {
      await sql`INSERT INTO portability_fixture (id, secret) VALUES ('fixture-a', 'source-value')`.execute(
        database.db,
      );
      const exported = (await service.export(context, { passphrase }))._unsafeUnwrap();
      await sql`DELETE FROM portability_fixture`.execute(database.db);
      await sql`ALTER TABLE portability_fixture ADD CONSTRAINT portability_fixture_target_check CHECK (secret = 'target-value')`.execute(
        database.db,
      );
      await sql`INSERT INTO portability_fixture (id, secret) VALUES ('fixture-a', 'target-value')`.execute(
        database.db,
      );

      const failed = await service.importControlPlane(context, {
        encryptedEnvelope: exported.encryptedEnvelope,
        passphrase,
        mode: "replace",
        acknowledgeReplace: true,
      });
      expect(failed.isErr()).toBe(true);
      expect(failed._unsafeUnwrapErr().details?.rollbackArtifactId).toBeString();

      const rows = await sql<{
        id: string;
        secret: string;
      }>`SELECT id, secret FROM portability_fixture`.execute(database.db);
      expect(rows.rows).toEqual([{ id: "fixture-a", secret: "target-value" }]);
      const artifacts = (await service.listArtifacts(context))._unsafeUnwrap();
      expect(artifacts.some((artifact) => artifact.kind === "rollback")).toBe(true);
    }));
});
