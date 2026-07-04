import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "kysely";

describe("advisor-driven schema indexes", () => {
  test("[PG-ADVISOR-IDX-001] pglite final schema keeps hot FK indexes and removes duplicate organization slug index", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-schema-advisor-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");

    try {
      const { createDatabase, createMigrator } = await import("../src/index");
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });

      try {
        const migrationResult = await createMigrator(database.db).migrateToLatest();
        expect(migrationResult.error).toBeUndefined();

        const expectedIndexNames = [
          "resources_destination_id_fkey_idx",
          "resources_environment_id_fkey_idx",
          "servers_credential_id_fkey_idx",
          "environments_parent_environment_id_fkey_idx",
        ];

        const fkIndexRows = await sql<{ indexname: string }>`
          SELECT indexname
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname = ANY(${expectedIndexNames})
        `.execute(database.db);

        expect(fkIndexRows.rows.map((row) => row.indexname).sort()).toEqual(
          [...expectedIndexNames].sort(),
        );

        const slugIndexRows = await sql<{ indexname: string }>`
          SELECT indexname
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'organization'
            AND indexname IN ('organization_slug_key', 'organization_slug_uidx')
          ORDER BY indexname
        `.execute(database.db);

        expect(slugIndexRows.rows).toEqual([{ indexname: "organization_slug_key" }]);

        const slugConstraint = await sql<{ conname: string; contype: string }>`
          SELECT con.conname, con.contype
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
          JOIN pg_namespace ns ON ns.oid = rel.relnamespace
          WHERE ns.nspname = 'public'
            AND rel.relname = 'organization'
            AND con.conname = 'organization_slug_key'
        `.execute(database.db);

        expect(slugConstraint.rows).toEqual([
          {
            conname: "organization_slug_key",
            contype: "u",
          },
        ]);
      } finally {
        await database.close();
      }
    } finally {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  });
});
