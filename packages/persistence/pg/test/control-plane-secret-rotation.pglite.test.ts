import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AesGcmControlPlaneSecretProtector } from "@appaloft/adapter-secret-protection";
import { createExecutionContext } from "@appaloft/application";

import {
  createDatabase,
  createMigrator,
  PgControlPlaneSecretRotationService,
  PgDependencyResourceSecretStore,
} from "../src";

const key = (fill: number): string => Buffer.alloc(32, fill).toString("base64");
const context = createExecutionContext({
  requestId: "req_secret_rotation_test",
  entrypoint: "system",
});

async function withDatabase(
  run: (database: Awaited<ReturnType<typeof createDatabase>>) => Promise<void>,
): Promise<void> {
  const dataDir = mkdtempSync(join(tmpdir(), "appaloft-secret-rotation-"));
  const database = await createDatabase({ driver: "pglite", pgliteDataDir: dataDir });
  try {
    const migrated = await createMigrator(database.db).migrateToLatest();
    expect(migrated.error).toBeUndefined();
    await run(database);
  } finally {
    await database.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
}

function protectors() {
  const oldProtector = AesGcmControlPlaneSecretProtector.create({
    activeKeyId: "key-v1",
    keys: { "key-v1": key(11) },
  })._unsafeUnwrap();
  const rotatingProtector = AesGcmControlPlaneSecretProtector.create({
    activeKeyId: "key-v2",
    keys: { "key-v1": key(11), "key-v2": key(12) },
  })._unsafeUnwrap();
  return { oldProtector, rotatingProtector };
}

async function seedTwoSecrets(
  database: Awaited<ReturnType<typeof createDatabase>>,
  oldProtector: ReturnType<typeof protectors>["oldProtector"],
) {
  const store = new PgDependencyResourceSecretStore(database.db, oldProtector);
  for (const [id, marker] of [
    ["rsi_rotation_a", "ROTATION_MARKER_A"],
    ["rsi_rotation_b", "ROTATION_MARKER_B"],
  ] as const) {
    const stored = await store.storeConnection(context, {
      dependencyResourceId: id,
      projectId: "prj_rotation",
      environmentId: "env_rotation",
      kind: "postgres",
      purpose: "connection",
      secretValue: marker,
      storedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(stored.isOk()).toBe(true);
  }
}

async function envelopeStates(
  database: Awaited<ReturnType<typeof createDatabase>>,
  protector: ReturnType<typeof protectors>["rotatingProtector"],
) {
  const rows = await database.db
    .selectFrom("dependency_resource_secrets")
    .select("payload")
    .orderBy("ref")
    .execute();
  return rows.map((row) => protector.inspect((row.payload as { value: string }).value).state);
}

describe("control-plane secret rotation", () => {
  test("[CPS-DIAG-018] plan reports a failed source without database details", () =>
    withDatabase(async (database) => {
      const failingDatabase = new Proxy(database.db, {
        get(target, property) {
          if (property === "selectFrom") {
            return (table: string) => {
              if (table === "environment_variables") throw new Error("private database detail");
              const selectFrom = target.selectFrom.bind(target) as unknown as (
                source: string,
              ) => ReturnType<typeof target.selectFrom>;
              return selectFrom(table);
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as typeof database.db;
      const { rotatingProtector } = protectors();

      const plan = await new PgControlPlaneSecretRotationService(
        failingDatabase,
        rotatingProtector,
      ).plan();

      expect(plan._unsafeUnwrapErr()).toMatchObject({
        code: "control_plane_secret_rotation_source_read_failed",
        category: "infra",
        retryable: false,
        details: {
          phase: "control-plane-secret-rotation",
          reason: "environment-variables-read-failed",
        },
      });
      expect(JSON.stringify(plan)).not.toContain("environment_variables");
      expect(JSON.stringify(plan)).not.toContain("SELECT");
    }));

  test("[CPS-COMPAT-019] optional source failures other than undefined-table stay fail-closed", () =>
    withDatabase(async (database) => {
      const failingDatabase = new Proxy(database.db, {
        get(target, property) {
          if (property === "selectFrom") {
            return (table: string) => {
              if (table === "resource_variables") throw new Error("private optional read detail");
              const selectFrom = target.selectFrom.bind(target) as unknown as (
                source: string,
              ) => ReturnType<typeof target.selectFrom>;
              return selectFrom(table);
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as typeof database.db;
      const { rotatingProtector } = protectors();

      const plan = await new PgControlPlaneSecretRotationService(
        failingDatabase,
        rotatingProtector,
      ).plan();

      expect(plan._unsafeUnwrapErr()).toMatchObject({
        code: "control_plane_secret_rotation_source_read_failed",
        details: {
          phase: "control-plane-secret-rotation",
          reason: "resource-variables-read-failed",
        },
      });
      expect(JSON.stringify(plan)).not.toContain("private optional read detail");
      expect(JSON.stringify(plan)).not.toContain("resource_variables");
    }));

  test("[CPS-COMPAT-017][CPS-COMPAT-019] plan treats absent post-initial secret tables as empty", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-secret-rotation-legacy-"));
    const database = await createDatabase({ driver: "pglite", pgliteDataDir: dataDir });
    try {
      const migrated = await createMigrator(database.db).migrateTo("026_mutation_coordinations");
      expect(migrated.error).toBeUndefined();
      const { rotatingProtector } = protectors();

      const plan = await new PgControlPlaneSecretRotationService(
        database.db,
        rotatingProtector,
      ).plan();

      expect(plan._unsafeUnwrap()).toMatchObject({
        recordCount: 0,
        variableKeyCount: 0,
        ready: true,
        stateCounts: {
          "active-key": 0,
          "retained-key": 0,
          "legacy-plaintext": 0,
          unreadable: 0,
        },
      });
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("[CPS-COMPAT-020] plan treats a pre-initial state as an empty rotation source", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-secret-rotation-pre-initial-"));
    const database = await createDatabase({ driver: "pglite", pgliteDataDir: dataDir });
    try {
      const { rotatingProtector } = protectors();

      const plan = await new PgControlPlaneSecretRotationService(
        database.db,
        rotatingProtector,
      ).plan();

      expect(plan._unsafeUnwrap()).toMatchObject({
        recordCount: 0,
        variableKeyCount: 0,
        ready: true,
        stateCounts: {
          "active-key": 0,
          "retained-key": 0,
          "legacy-plaintext": 0,
          unreadable: 0,
        },
      });
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("[CPS-DIAG-021] plan classifies a safe SQLSTATE category without database details", () =>
    withDatabase(async (database) => {
      const failingDatabase = new Proxy(database.db, {
        get(target, property) {
          if (property === "selectFrom") {
            return (table: string) => {
              if (table === "environment_variables") {
                throw Object.assign(new Error("private schema detail"), { code: "42703" });
              }
              const selectFrom = target.selectFrom.bind(target) as unknown as (
                source: string,
              ) => ReturnType<typeof target.selectFrom>;
              return selectFrom(table);
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as typeof database.db;
      const { rotatingProtector } = protectors();

      const plan = await new PgControlPlaneSecretRotationService(
        failingDatabase,
        rotatingProtector,
      ).plan();

      expect(plan._unsafeUnwrapErr()).toMatchObject({
        code: "control_plane_secret_rotation_source_read_failed",
        details: {
          phase: "control-plane-secret-rotation",
          reason: "environment-variables-schema-incompatible",
        },
      });
      expect(JSON.stringify(plan)).not.toContain("private schema detail");
      expect(JSON.stringify(plan)).not.toContain("42703");
    }));

  test("[CPS-COMPAT-020][CPS-DIAG-021] nested undefined-table SQLSTATE stays empty", () =>
    withDatabase(async (database) => {
      const missingEnvironmentDatabase = new Proxy(database.db, {
        get(target, property) {
          if (property === "selectFrom") {
            return (table: string) => {
              if (table === "environment_variables") {
                throw new Error("outer detail", {
                  cause: Object.assign(new Error("inner detail"), { code: "42P01" }),
                });
              }
              const selectFrom = target.selectFrom.bind(target) as unknown as (
                source: string,
              ) => ReturnType<typeof target.selectFrom>;
              return selectFrom(table);
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as typeof database.db;
      const { rotatingProtector } = protectors();

      const plan = await new PgControlPlaneSecretRotationService(
        missingEnvironmentDatabase,
        rotatingProtector,
      ).plan();

      expect(plan._unsafeUnwrap()).toMatchObject({ recordCount: 0, ready: true });
    }));

  test("[CPS-DIAG-022] known driver wrapper fields preserve safe SQLSTATE classification", () =>
    withDatabase(async (database) => {
      const failingDatabase = new Proxy(database.db, {
        get(target, property) {
          if (property === "selectFrom") {
            return (table: string) => {
              if (table === "environment_variables") {
                throw {
                  error: {
                    originalError: {
                      sqlState: "42703",
                      message: "private wrapped schema detail",
                    },
                  },
                };
              }
              const selectFrom = target.selectFrom.bind(target) as unknown as (
                source: string,
              ) => ReturnType<typeof target.selectFrom>;
              return selectFrom(table);
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as typeof database.db;
      const { rotatingProtector } = protectors();

      const plan = await new PgControlPlaneSecretRotationService(
        failingDatabase,
        rotatingProtector,
      ).plan();

      expect(plan._unsafeUnwrapErr()).toMatchObject({
        code: "control_plane_secret_rotation_source_read_failed",
        details: {
          phase: "control-plane-secret-rotation",
          reason: "environment-variables-schema-incompatible",
        },
      });
      expect(JSON.stringify(plan)).not.toContain("private wrapped schema detail");
      expect(JSON.stringify(plan)).not.toContain("42703");
    }));

  test("[CPS-DIAG-023] SQLSTATE classes preserve fixed safe source categories", () =>
    withDatabase(async (database) => {
      const failingDatabase = new Proxy(database.db, {
        get(target, property) {
          if (property === "selectFrom") {
            return (table: string) => {
              if (table === "environment_variables") {
                throw Object.assign(new Error("private operator detail"), { code: "42883" });
              }
              const selectFrom = target.selectFrom.bind(target) as unknown as (
                source: string,
              ) => ReturnType<typeof target.selectFrom>;
              return selectFrom(table);
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as typeof database.db;
      const { rotatingProtector } = protectors();

      const plan = await new PgControlPlaneSecretRotationService(
        failingDatabase,
        rotatingProtector,
      ).plan();

      expect(plan._unsafeUnwrapErr()).toMatchObject({
        code: "control_plane_secret_rotation_source_read_failed",
        details: {
          phase: "control-plane-secret-rotation",
          reason: "environment-variables-schema-incompatible",
        },
      });
      expect(JSON.stringify(plan)).not.toContain("private operator detail");
      expect(JSON.stringify(plan)).not.toContain("42883");
    }));

  test("[CPS-FAIL-003][CPS-ROTATE-006] same key id with wrong material is unreadable, never already-active", () =>
    withDatabase(async (database) => {
      const { oldProtector } = protectors();
      await seedTwoSecrets(database, oldProtector);
      const wrongProtector = AesGcmControlPlaneSecretProtector.create({
        activeKeyId: "key-v1",
        keys: { "key-v1": key(99) },
      })._unsafeUnwrap();
      const service = new PgControlPlaneSecretRotationService(database.db, wrongProtector);

      const plan = (await service.plan())._unsafeUnwrap();
      expect(plan).toMatchObject({
        ready: false,
        stateCounts: { unreadable: 2, "active-key": 0 },
        unreadableFindings: [
          {
            source: "dependency-resource-secret",
            dependencyResourceId: "rsi_rotation_a",
            reason: "authentication-failed",
          },
          {
            source: "dependency-resource-secret",
            dependencyResourceId: "rsi_rotation_b",
            reason: "authentication-failed",
          },
        ],
        unreadableFindingsTruncated: false,
      });
      expect(JSON.stringify(plan)).not.toContain("ROTATION_MARKER");
      const applied = await service.apply({
        planDigest: plan.planDigest,
        backupReference: "backup:test-wrong-key",
        allowLegacyPlaintext: false,
      });
      expect(applied._unsafeUnwrapErr().code).toBe("control_plane_secret_materialization_failed");
      expect(await envelopeStates(database, oldProtector)).toEqual(["active-key", "active-key"]);
    }));

  test("[CPS-ROTATE-006] rotates retained envelopes and is idempotent", () =>
    withDatabase(async (database) => {
      const { oldProtector, rotatingProtector } = protectors();
      await seedTwoSecrets(database, oldProtector);
      const service = new PgControlPlaneSecretRotationService(database.db, rotatingProtector);

      const plan = (await service.plan())._unsafeUnwrap();
      expect(plan).toMatchObject({
        recordCount: 2,
        variableKeyCount: 2,
        stateCounts: { "retained-key": 2, "active-key": 0 },
        ready: true,
      });
      expect(JSON.stringify(plan)).not.toContain("ROTATION_MARKER");

      const applied = await service.apply({
        planDigest: plan.planDigest,
        backupReference: "backup:test-rotation-001",
        allowLegacyPlaintext: false,
      });
      expect(applied._unsafeUnwrap()).toMatchObject({
        rotatedRecordCount: 2,
        status: "applied",
      });
      expect(await envelopeStates(database, rotatingProtector)).toEqual([
        "active-key",
        "active-key",
      ]);

      const retryPlan = (await service.plan())._unsafeUnwrap();
      const retry = await service.apply({
        planDigest: retryPlan.planDigest,
        backupReference: "backup:test-rotation-001",
        allowLegacyPlaintext: false,
      });
      expect(retry._unsafeUnwrap()).toMatchObject({
        rotatedRecordCount: 0,
        unchangedRecordCount: 2,
        status: "already-active",
      });
    }));

  test("[CPS-ROTATE-007] mid-transaction failure rolls back and retry succeeds", () =>
    withDatabase(async (database) => {
      const { oldProtector, rotatingProtector } = protectors();
      await seedTwoSecrets(database, oldProtector);
      const failing = new PgControlPlaneSecretRotationService(database.db, rotatingProtector, {
        afterWrite(completedWriteCount) {
          if (completedWriteCount === 1) throw new Error("test fault");
        },
      });
      const plan = (await failing.plan())._unsafeUnwrap();
      const failed = await failing.apply({
        planDigest: plan.planDigest,
        backupReference: "backup:test-rotation-rollback",
        allowLegacyPlaintext: false,
      });
      expect(failed.isErr()).toBe(true);
      expect(await envelopeStates(database, rotatingProtector)).toEqual([
        "retained-key",
        "retained-key",
      ]);

      const retry = await new PgControlPlaneSecretRotationService(
        database.db,
        rotatingProtector,
      ).apply({
        planDigest: plan.planDigest,
        backupReference: "backup:test-rotation-rollback",
        allowLegacyPlaintext: false,
      });
      expect(retry._unsafeUnwrap().rotatedRecordCount).toBe(2);
    }));

  test("[CPS-ROTATE-008] legacy plaintext needs explicit authorization and backup evidence", () =>
    withDatabase(async (database) => {
      await database.db
        .insertInto("dependency_resource_secrets")
        .values({
          ref: "appaloft://dependency-resources/rsi_legacy/connection",
          dependency_resource_id: "rsi_legacy",
          project_id: "prj_rotation",
          environment_id: "env_rotation",
          kind: "postgres",
          purpose: "connection",
          payload: { value: "LEGACY_ROTATION_MARKER" },
          metadata: { storedAt: "2026-01-01T00:00:00.000Z" },
          created_at: "2026-01-01T00:00:00.000Z",
        })
        .execute();
      const { rotatingProtector } = protectors();
      const service = new PgControlPlaneSecretRotationService(database.db, rotatingProtector);
      const plan = (await service.plan())._unsafeUnwrap();
      expect(plan).toMatchObject({
        requiresLegacyAuthorization: true,
        stateCounts: { "legacy-plaintext": 1 },
      });

      const noBackup = await service.apply({
        planDigest: plan.planDigest,
        backupReference: "",
        allowLegacyPlaintext: true,
      });
      expect(noBackup._unsafeUnwrapErr().code).toBe(
        "control_plane_secret_rotation_backup_required",
      );
      const blocked = await service.apply({
        planDigest: plan.planDigest,
        backupReference: "backup:test-legacy",
        allowLegacyPlaintext: false,
      });
      expect(blocked._unsafeUnwrapErr().code).toBe(
        "control_plane_secret_legacy_migration_required",
      );
      expect(await envelopeStates(database, rotatingProtector)).toEqual(["legacy-plaintext"]);

      const migrated = await service.apply({
        planDigest: plan.planDigest,
        backupReference: "backup:test-legacy",
        allowLegacyPlaintext: true,
      });
      expect(migrated._unsafeUnwrap().rotatedRecordCount).toBe(1);
      expect(await envelopeStates(database, rotatingProtector)).toEqual(["active-key"]);
    }));
});
