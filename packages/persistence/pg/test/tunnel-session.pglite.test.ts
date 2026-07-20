import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createExecutionContext,
  type TunnelSessionRecord,
  toRepositoryContext,
} from "@appaloft/application";

import { createDatabase, createMigrator, PgTunnelSessionRepository } from "../src";

describe("tunnel session persistence", () => {
  test("[TUNNEL-PERSIST-008] persists private provider handle but keeps tenant-scoped readback", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-tunnel-session-"));
    const database = await createDatabase({ driver: "pglite", pgliteDataDir: dataDir });
    try {
      expect((await createMigrator(database.db).migrateToLatest()).error).toBeUndefined();
      const context = toRepositoryContext(
        createExecutionContext({
          requestId: "req_tunnel_pg",
          entrypoint: "system",
          actor: { kind: "system", id: "test" },
        }),
      );
      const repository = new PgTunnelSessionRepository(database.db);
      const record: TunnelSessionRecord = {
        id: "tun_pg",
        providerKey: "cloudflare-quick",
        originUrl: "http://127.0.0.1:3000",
        publicUrl: "https://pg.trycloudflare.com",
        status: "ready",
        expiresAt: "2026-07-20T01:00:00.000Z",
        createdAt: "2026-07-20T00:00:00.000Z",
        updatedAt: "2026-07-20T00:00:00.000Z",
        revokedAt: null,
        failureCode: null,
        providerHandle: {
          sessionRef: "pg",
          processId: 44,
          executable: "cloudflared",
          originUrl: "http://127.0.0.1:3000",
        },
      };
      expect((await repository.save(context, record)).isOk()).toBe(true);
      expect((await repository.findOne(context, record.id))._unsafeUnwrap()).toEqual(record);
      expect(
        (await repository.listRecords(context, { statuses: ["ready"], limit: 1 }))._unsafeUnwrap(),
      ).toHaveLength(1);
      expect(
        (await repository.listRecords(context, { statuses: ["revoked"] }))._unsafeUnwrap(),
      ).toHaveLength(0);
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
