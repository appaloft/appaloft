import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";

function context() {
  return toRepositoryContext(
    createExecutionContext({
      entrypoint: "system",
      requestId: "req_process_attempt_journal_test",
      tracer: {
        startActiveSpan(_name, _options, callback) {
          return Promise.resolve(
            callback({
              addEvent() {},
              recordError() {},
              setAttribute() {},
              setAttributes() {},
              setStatus() {},
            }),
          );
        },
      },
    }),
  );
}

describe("process attempt journal persistence", () => {
  test("[OP-WORK-JOURNAL-002] migrates, records, filters, shows, and sanitizes process attempts", async () => {
    const { createDatabase, createMigrator, PgProcessAttemptJournal } = await import("../src");
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-process-attempt-journal-"));
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: workspaceDir,
    });
    const migrator = createMigrator(database.db);
    await migrator.migrateToLatest();
    const journal = new PgProcessAttemptJournal(database.db);
    const repositoryContext = context();

    const recorded = await journal.record(repositoryContext, {
      id: "pxy_journal_1",
      kind: "proxy-bootstrap",
      status: "running",
      operationKey: "servers.bootstrap-proxy",
      dedupeKey: "proxy-bootstrap:srv_journal:pxy_journal_1",
      correlationId: "req_journal",
      requestId: "req_journal",
      phase: "proxy-bootstrap",
      step: "starting",
      serverId: "srv_journal",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      nextActions: ["no-action"],
      safeDetails: {
        providerKey: "caddy",
        commandLine: "PRIVATE_KEY=raw-value caddy run",
      },
    });
    expect(recorded.isOk()).toBe(true);

    const updated = await journal.record(repositoryContext, {
      id: "pxy_journal_1",
      kind: "proxy-bootstrap",
      status: "failed",
      operationKey: "servers.bootstrap-proxy",
      phase: "proxy-container",
      step: "failed",
      updatedAt: "2026-01-01T00:00:05.000Z",
      finishedAt: "2026-01-01T00:00:05.000Z",
      errorCode: "edge_proxy_start_failed",
      errorCategory: "async-processing",
      retriable: true,
      nextActions: ["diagnostic", "manual-review"],
      safeDetails: {
        proxyKind: "caddy",
      },
    });
    expect(updated.isOk()).toBe(true);

    const list = await journal.list(repositoryContext, {
      kind: "proxy-bootstrap",
      status: "failed",
      serverId: "srv_journal",
    });
    const shown = await journal.findOne(repositoryContext, "pxy_journal_1");

    expect(list).toEqual([
      expect.objectContaining({
        id: "pxy_journal_1",
        kind: "proxy-bootstrap",
        status: "failed",
        operationKey: "servers.bootstrap-proxy",
        serverId: "srv_journal",
        errorCode: "edge_proxy_start_failed",
        retriable: true,
        safeDetails: {
          providerKey: "caddy",
          proxyKind: "caddy",
        },
      }),
    ]);
    expect(shown).toMatchObject({
      id: "pxy_journal_1",
      serverId: "srv_journal",
      finishedAt: "2026-01-01T00:00:05.000Z",
    });
    expect(JSON.stringify(list)).not.toContain("PRIVATE_KEY");

    await database.close();
  });
});
