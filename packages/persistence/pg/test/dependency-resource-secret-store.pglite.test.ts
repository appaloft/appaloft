import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext } from "@appaloft/application";

describe("dependency resource secret store persistence", () => {
  test("[DEP-BIND-SECRET-RESOLVE-001] [DEP-BIND-SECRET-RESOLVE-002] stores and resolves imported dependency connection values", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-dependency-resource-secret-"));
    const { createDatabase, createMigrator, PgDependencyResourceSecretStore } = await import(
      "../src"
    );
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const executionContext = createExecutionContext({
        requestId: "req_dependency_resource_secret_store_pglite_test",
        entrypoint: "system",
      });
      const store = new PgDependencyResourceSecretStore(database.db);
      const postgresUrl = "postgres://app:super-secret@db.example.com:5432/app";
      const redisUrl = "rediss://default:super-secret@cache.example.com:6380/0";

      const postgresStored = await store.storeConnection(executionContext, {
        dependencyResourceId: "rsi_pg",
        projectId: "prj_demo",
        environmentId: "env_demo",
        kind: "postgres",
        purpose: "connection",
        secretValue: postgresUrl,
        storedAt: "2026-01-01T00:00:00.000Z",
      });
      const redisStored = await store.storeConnection(executionContext, {
        dependencyResourceId: "rsi_redis",
        projectId: "prj_demo",
        environmentId: "env_demo",
        kind: "redis",
        purpose: "connection",
        secretValue: redisUrl,
        storedAt: "2026-01-01T00:00:00.000Z",
      });

      expect(postgresStored._unsafeUnwrap()).toEqual({
        secretRef: "appaloft://dependency-resources/rsi_pg/connection",
      });
      expect(redisStored._unsafeUnwrap()).toEqual({
        secretRef: "appaloft://dependency-resources/rsi_redis/connection",
      });
      await expect(
        database.db.selectFrom("dependency_resources").selectAll().execute(),
      ).resolves.toEqual([]);

      const postgresResolved = await store.resolve(executionContext, {
        secretRef: postgresStored._unsafeUnwrap().secretRef,
      });
      const redisResolved = await store.resolve(executionContext, {
        secretRef: redisStored._unsafeUnwrap().secretRef,
      });
      const missing = await store.resolve(executionContext, {
        secretRef: "appaloft://dependency-resources/missing/connection",
      });

      expect(postgresResolved._unsafeUnwrap()).toEqual({
        secretRef: postgresStored._unsafeUnwrap().secretRef,
        secretValue: postgresUrl,
      });
      expect(redisResolved._unsafeUnwrap()).toEqual({
        secretRef: redisStored._unsafeUnwrap().secretRef,
        secretValue: redisUrl,
      });
      expect(missing.isErr()).toBe(true);
      expect(missing._unsafeUnwrapErr().code).toBe("not_found");
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
