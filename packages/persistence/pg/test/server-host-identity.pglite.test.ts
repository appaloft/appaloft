import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("server host identity migration", () => {
  test("[SERVER-BOOT-HOST-007] canonicalizes valid existing IPv6 host rows", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-server-host-identity-"));
    const { createDatabase, createMigrator } = await import("../src");
    const database = await createDatabase({ driver: "pglite", pgliteDataDir: dataDir });

    try {
      const migrator = createMigrator(database.db);
      expect((await migrator.migrateTo("099_source_event_change_set")).error).toBeUndefined();
      await database.db
        .insertInto("servers")
        .values({
          id: "srv_legacy_ipv6",
          name: "Legacy IPv6",
          host: "[2001:0db8::1]",
          port: 22,
          provider_key: "generic-ssh",
          edge_proxy_kind: null,
          edge_proxy_status: null,
          edge_proxy_last_attempt_at: null,
          edge_proxy_last_succeeded_at: null,
          edge_proxy_last_error_code: null,
          edge_proxy_last_error_message: null,
          credential_id: null,
          credential_kind: null,
          credential_username: null,
          credential_public_key: null,
          credential_private_key: null,
          created_at: "2026-01-01T00:00:00.000Z",
        })
        .execute();

      expect((await migrator.migrateToLatest()).error).toBeUndefined();
      const row = await database.db
        .selectFrom("servers")
        .select("host")
        .where("id", "=", "srv_legacy_ipv6")
        .executeTakeFirstOrThrow();
      expect(row.host).toBe("2001:db8::1");
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
