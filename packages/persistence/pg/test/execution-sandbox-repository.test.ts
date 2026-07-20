import "reflect-metadata";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import {
  CreatedAt,
  ExpiresAt,
  Sandbox,
  SandboxCredentialGrant,
  SandboxId,
  SandboxIsolationLevel,
  SandboxNetworkPolicy,
  SandboxResourceLimits,
  SandboxSnapshot,
  SandboxSnapshotId,
  type SandboxSource,
  SandboxTemplate,
  SandboxTemplateId,
  SandboxTemplateName,
  UpdatedAt,
} from "@appaloft/core";
import { createDatabase, createMigrator, PgExecutionSandboxRepository } from "../src";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function context(tenantId: string) {
  return toRepositoryContext(
    createExecutionContext({
      entrypoint: "system",
      tenant: { tenantId },
      requestId: `req_${tenantId}`,
    }),
  );
}

function sandbox(
  id = "sbx_pg",
  source: SandboxSource = { kind: "image", image: "python@sha256:abc123" },
) {
  return Sandbox.create({
    id: SandboxId.rehydrate(id),
    source,
    requestedIsolation: SandboxIsolationLevel.gvisor(),
    limits: SandboxResourceLimits.create({
      cpuMillis: 1000,
      memoryBytes: 1024,
      diskBytes: 2048,
      maxProcesses: 8,
    })._unsafeUnwrap(),
    networkPolicy: SandboxNetworkPolicy.defaultDeny(),
    createdAt: CreatedAt.rehydrate("2026-07-20T00:00:00.000Z"),
    expiresAt: ExpiresAt.rehydrate("2026-07-20T01:00:00.000Z"),
    currentAttemptId: "sat_pg",
  })._unsafeUnwrap();
}

describe("PgExecutionSandboxRepository", () => {
  test("[SBX-PG-001] round-trips safe aggregate and snapshot state", async () => {
    const directory = mkdtempSync(join(tmpdir(), "appaloft-sandbox-pg-"));
    directories.push(directory);
    const database = await createDatabase({ driver: "pglite", pgliteDataDir: directory });
    try {
      expect((await createMigrator(database.db).migrateToLatest()).error).toBeUndefined();
      const repository = new PgExecutionSandboxRepository(database.db);
      const aggregate = sandbox();
      aggregate
        .startProvisioning({
          attemptId: "sat_pg",
          at: UpdatedAt.rehydrate("2026-07-20T00:00:01.000Z"),
        })
        ._unsafeUnwrap();
      aggregate
        .markReady({
          realizedIsolation: SandboxIsolationLevel.gvisor(),
          providerHandle: "opaque:runtime",
          at: UpdatedAt.rehydrate("2026-07-20T00:00:02.000Z"),
        })
        ._unsafeUnwrap();
      await repository.save(context("tenant_a"), aggregate, "hermetic");

      const loaded = await repository.find(context("tenant_a"), "sbx_pg");
      expect(loaded?.sandbox.toState()).toMatchObject({
        providerHandle: "opaque:runtime",
        currentAttemptId: "sat_pg",
      });
      expect(loaded?.sandbox.toState().networkPolicy.toState()).toEqual({
        mode: "deny",
        rules: [],
      });
      expect(
        await repository.listProviderRuntimes(context("tenant_a"), {
          providerKey: "hermetic",
          limit: 10,
          offset: 0,
        }),
      ).toEqual([{ sandboxId: "sbx_pg", providerHandle: "opaque:runtime" }]);
      expect(
        await repository.listProviderRuntimes(context("tenant_b"), {
          providerKey: "hermetic",
          limit: 10,
          offset: 0,
        }),
      ).toEqual([]);

      const grant = SandboxCredentialGrant.create({
        grantId: "grant_pg",
        secretRef: "vault://sandbox/api-token",
        destination: "api.example.com",
        transformation: "authorization-bearer",
      })._unsafeUnwrap();
      await repository.saveCredentialGrant(context("tenant_a"), "sbx_pg", grant);
      expect(
        (
          await repository.findCredentialGrant(context("tenant_a"), "sbx_pg", "grant_pg")
        )?.toState(),
      ).toEqual(grant.toState());
      expect(
        await repository.findCredentialGrant(context("tenant_b"), "sbx_pg", "grant_pg"),
      ).toBeNull();

      const snapshot = SandboxSnapshot.create({
        id: SandboxSnapshotId.rehydrate("ssn_pg"),
        sourceSandboxId: SandboxId.rehydrate("sbx_pg"),
        capability: "filesystem",
        createdAt: CreatedAt.rehydrate("2026-07-20T00:10:00.000Z"),
      })._unsafeUnwrap();
      snapshot
        .startCapture({
          attemptId: "sat_snapshot",
          at: UpdatedAt.rehydrate("2026-07-20T00:10:01.000Z"),
        })
        ._unsafeUnwrap();
      snapshot
        .markReady({
          providerHandle: "opaque:snapshot",
          sizeBytes: 3,
          at: UpdatedAt.rehydrate("2026-07-20T00:10:02.000Z"),
        })
        ._unsafeUnwrap();
      await repository.saveSnapshot(context("tenant_a"), snapshot, "hermetic");
      expect(
        (await repository.findSnapshot(context("tenant_a"), "ssn_pg"))?.snapshot.toState(),
      ).toMatchObject({ sizeBytes: 3, providerHandle: "opaque:snapshot" });

      const restored = sandbox("sbx_restored", {
        kind: "snapshot",
        snapshotId: SandboxSnapshotId.rehydrate("ssn_pg"),
      });
      await repository.save(context("tenant_a"), restored, "hermetic");
      expect(
        (await repository.find(context("tenant_a"), "sbx_restored"))?.sandbox.toState().source,
      ).toMatchObject({ kind: "snapshot", snapshotId: { value: "ssn_pg" } });

      const template = SandboxTemplate.create({
        id: SandboxTemplateId.rehydrate("stp_python"),
        name: SandboxTemplateName.rehydrate("Python"),
        image: "python@sha256:abc123",
        minimumIsolation: SandboxIsolationLevel.gvisor(),
        limits: aggregate.toState().limits,
        networkPolicy: SandboxNetworkPolicy.defaultDeny(),
        overridePolicy: {
          isolation: "strengthen-only",
          limits: "decrease-only",
          network: "immutable",
        },
        createdAt: CreatedAt.rehydrate("2026-07-20T00:00:00.000Z"),
      })._unsafeUnwrap();
      await repository.saveTemplate(context("tenant_a"), template);
      expect(
        (await repository.findTemplate(context("tenant_a"), "stp_python"))?.template.toState(),
      ).toMatchObject({ image: "python@sha256:abc123", name: { value: "Python" } });
    } finally {
      await database.close();
    }
  });

  test("[SBX-PG-002] enforces tenant isolation and bounded lists", async () => {
    const directory = mkdtempSync(join(tmpdir(), "appaloft-sandbox-tenant-"));
    directories.push(directory);
    const database = await createDatabase({ driver: "pglite", pgliteDataDir: directory });
    try {
      await createMigrator(database.db).migrateToLatest();
      const repository = new PgExecutionSandboxRepository(database.db);
      await repository.save(context("tenant_a"), sandbox(), "hermetic");
      expect(await repository.find(context("tenant_b"), "sbx_pg")).toBeNull();
      expect(await repository.list(context("tenant_b"), { limit: 10, offset: 0 })).toEqual([]);
      expect(await repository.list(context("tenant_a"), { limit: 1, offset: 0 })).toHaveLength(1);
      await repository.save(context("tenant_b"), sandbox("sbx_b"), "hermetic");
      expect(
        await repository.listMaintenanceTenantIds(context("tenant_instance"), {
          limit: 10,
          offset: 0,
        }),
      ).toEqual(["tenant_a", "tenant_b"]);
    } finally {
      await database.close();
    }
  });
});
