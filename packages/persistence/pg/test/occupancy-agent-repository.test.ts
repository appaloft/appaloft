import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDatabase, createMigrator, PgOccupancyAgentRepository } from "../src";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const key = {
  tenantId: "tenant_a",
  subjectId: "usr_1",
  projectId: "prj_notes",
  repositoryIdentity: "github.com/acme/notes",
  branch: "main",
};

describe("OccupancyAgent persistence", () => {
  test("[WS-AGENT-ID-008][WS-AGENT-ID-009] occupy persists one active Agent and retargets the Sandbox", async () => {
    const directory = mkdtempSync(join(tmpdir(), "appaloft-occupancy-agent-pg-"));
    directories.push(directory);
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: directory,
    });
    try {
      expect((await createMigrator(database.db).migrateToLatest()).error).toBeUndefined();
      let sequence = 0;
      const agents = new PgOccupancyAgentRepository(database.db, () => `agt_${++sequence}`);
      const created = await agents.occupy({
        ...key,
        sandboxId: "sbx_one",
        name: "resonant-silence",
        now: "2026-08-24T00:00:00.000Z",
      });
      const resumed = await agents.occupy({
        ...key,
        sandboxId: "sbx_two",
        name: "ignored-name",
        now: "2026-08-24T00:00:01.000Z",
      });
      expect(created._unsafeUnwrap()).toEqual({
        agentId: "agt_1",
        name: "resonant-silence",
        sandboxId: "sbx_one",
      });
      expect(resumed._unsafeUnwrap()).toEqual({
        agentId: "agt_1",
        name: "resonant-silence",
        sandboxId: "sbx_two",
      });
      const active = await agents.findActive(key);
      expect(active?.id.value).toBe("agt_1");
      expect(active?.sandboxId().value).toBe("sbx_two");
    } finally {
      await database.db.destroy();
    }
  });

  test("[WS-AGENT-ID-010] forceNew retires the previous row and inserts a new active Agent", async () => {
    const directory = mkdtempSync(join(tmpdir(), "appaloft-occupancy-agent-new-pg-"));
    directories.push(directory);
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: directory,
    });
    try {
      expect((await createMigrator(database.db).migrateToLatest()).error).toBeUndefined();
      let sequence = 0;
      const agents = new PgOccupancyAgentRepository(database.db, () => `agt_${++sequence}`);
      await agents.occupy({
        ...key,
        sandboxId: "sbx_one",
        name: "resonant-silence",
        now: "2026-08-24T00:00:00.000Z",
      });
      const replaced = await agents.occupy({
        ...key,
        sandboxId: "sbx_two",
        name: "copper-harbor",
        forceNew: true,
        now: "2026-08-24T00:00:01.000Z",
      });
      expect(replaced._unsafeUnwrap().agentId).toBe("agt_2");
      expect((await agents.findActive(key))?.id.value).toBe("agt_2");
      const retired = await database.db
        .selectFrom("occupancy_agents")
        .select(["id", "status"])
        .where("tenant_id", "=", key.tenantId)
        .where("id", "=", "agt_1")
        .executeTakeFirst();
      expect(retired?.status).toBe("retired");
    } finally {
      await database.db.destroy();
    }
  });
});
