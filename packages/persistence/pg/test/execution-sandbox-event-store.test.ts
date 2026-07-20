import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import { createDomainEvent } from "@appaloft/core";
import { createDatabase, createMigrator, PgDomainEventStreamRetentionStore } from "../src";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function context(tenantId: string) {
  return createExecutionContext({
    entrypoint: "http",
    requestId: `req_${tenantId}`,
    tenant: { tenantId, organizationId: `org_${tenantId}` },
  });
}

describe("Pg Sandbox event stream", () => {
  test("[SBX-STREAM-001] persists ordered tenant-scoped lifecycle and process envelopes", async () => {
    const directory = mkdtempSync(join(tmpdir(), "appaloft-sandbox-events-"));
    directories.push(directory);
    const database = await createDatabase({ driver: "pglite", pgliteDataDir: directory });
    try {
      await createMigrator(database.db).migrateToLatest();
      const store = new PgDomainEventStreamRetentionStore(database.db);
      const tenantA = context("tenant_a");
      await store.record(toRepositoryContext(tenantA), {
        requestId: tenantA.requestId,
        event: createDomainEvent("sandbox-requested", "sbx_stream", "2026-07-20T00:00:00.000Z", {}),
      });
      await store.record(toRepositoryContext(tenantA), {
        requestId: tenantA.requestId,
        event: createDomainEvent(
          "sandbox-process-frame",
          "sbx_stream",
          "2026-07-20T00:00:01.000Z",
          { frame: { kind: "exit", sequence: 1, exitCode: 0 } },
        ),
      });

      const opened = await store.open(
        tenantA,
        { sandboxId: "sbx_stream", limit: 10, follow: false, untilTerminal: false },
        new AbortController().signal,
      );
      const envelopes = [];
      for await (const envelope of opened._unsafeUnwrap()) envelopes.push(envelope);
      expect(envelopes).toMatchObject([
        { kind: "event", eventType: "sandbox-requested", source: "lifecycle" },
        { kind: "event", eventType: "sandbox-process-frame", source: "process" },
      ]);

      const crossTenant = await store.open(
        context("tenant_b"),
        { sandboxId: "sbx_stream", limit: 10, follow: false, untilTerminal: false },
        new AbortController().signal,
      );
      const hidden = [];
      for await (const envelope of crossTenant._unsafeUnwrap()) hidden.push(envelope);
      expect(hidden).toEqual([]);

      const missingCursor = await store.open(
        tenantA,
        {
          sandboxId: "sbx_stream",
          cursor: "missing",
          limit: 10,
          follow: false,
          untilTerminal: false,
        },
        new AbortController().signal,
      );
      const gap = [];
      for await (const envelope of missingCursor._unsafeUnwrap()) gap.push(envelope);
      expect(gap).toEqual([
        {
          kind: "error",
          schemaVersion: "sandbox.events/v1",
          code: "cursor-gap",
          retryable: false,
        },
      ]);
    } finally {
      await database.close();
    }
  });
});
