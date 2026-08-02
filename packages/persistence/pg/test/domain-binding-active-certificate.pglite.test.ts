import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("domain binding active certificate migration", () => {
  test("[ROUTE-TLS-EVT-017][ROUTE-TLS-EVT-020] persists the proven certificate identity", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-domain-binding-certificate-"));
    const { createDatabase, createMigrator } = await import("../src");
    const database = await createDatabase({ driver: "pglite", pgliteDataDir: dataDir });

    try {
      const migrator = createMigrator(database.db);
      expect((await migrator.migrateToLatest()).error).toBeUndefined();
      const updated = await database.db
        .updateTable("domain_bindings")
        .set({
          active_certificate_id: null,
          active_certificate_fingerprint: "sha256:proven",
        })
        .executeTakeFirstOrThrow();
      expect(updated.numUpdatedRows).toBe(0n);
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
