import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import {
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  DeploymentTargetName,
  DeploymentTargetWorkloadRoles,
  HostAddress,
  PortNumber,
  ProviderKey,
  UpdatedAt,
  UpsertDeploymentTargetSpec,
} from "@appaloft/core";
import { sql } from "kysely";

function createRepositoryContext() {
  return toRepositoryContext(
    createExecutionContext({
      entrypoint: "system",
      requestId: "req_server_workload_roles_persistence",
    }),
  );
}

function legacyServerRow(id: string) {
  return {
    id,
    name: "Legacy server",
    host: "192.0.2.10",
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
  };
}

describe("server workload role persistence", () => {
  test("[SRV-ROLE-PERSIST-001][SRV-ROLE-001] migrates legacy and defaulted servers to unrestricted roles", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-server-workload-roles-migration-"));
    const { createDatabase, createMigrator, PgServerReadModel, PgServerRepository } = await import(
      "../src"
    );
    const database = await createDatabase({ driver: "pglite", pgliteDataDir: dataDir });

    try {
      const migrator = createMigrator(database.db);
      expect((await migrator.migrateTo("111_agent_adapter_installations")).error).toBeUndefined();
      await database.db.insertInto("servers").values(legacyServerRow("srv_legacy_roles")).execute();

      expect((await migrator.migrateToLatest()).error).toBeUndefined();
      const row = await database.db
        .selectFrom("servers")
        .select("workload_roles")
        .where("id", "=", "srv_legacy_roles")
        .executeTakeFirstOrThrow();
      expect(row.workload_roles).toEqual([]);
      await database.db
        .insertInto("servers")
        .values(legacyServerRow("srv_default_roles"))
        .execute();
      const defaultedRow = await database.db
        .selectFrom("servers")
        .select("workload_roles")
        .where("id", "=", "srv_default_roles")
        .executeTakeFirstOrThrow();
      expect(defaultedRow.workload_roles).toEqual([]);

      const persisted = await new PgServerRepository(database.db).findOne(
        createRepositoryContext(),
        DeploymentTargetByIdSpec.create(DeploymentTargetId.rehydrate("srv_legacy_roles")),
      );
      expect(persisted?.toState().workloadRoles.isUnrestricted()).toBe(true);
      expect(persisted?.toState().workloadRoles.toJSON()).toEqual([]);
      const summary = await new PgServerReadModel(database.db).findOne(
        createRepositoryContext(),
        DeploymentTargetByIdSpec.create(DeploymentTargetId.rehydrate("srv_legacy_roles")),
      );
      expect(summary?.workloadRoles).toEqual([]);
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("[SRV-ROLE-PERSIST-001][SRV-ROLE-004] rejects noncanonical workload role storage", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-server-workload-roles-constraint-"));
    const { createDatabase, createMigrator } = await import("../src");
    const database = await createDatabase({ driver: "pglite", pgliteDataDir: dataDir });

    try {
      expect((await createMigrator(database.db).migrateToLatest()).error).toBeUndefined();
      await database.db
        .insertInto("servers")
        .values(legacyServerRow("srv_constrained_roles"))
        .execute();

      const invalidRepresentations = [
        { label: "object", value: { role: "deployment-runtime" } },
        { label: "unknown value", value: ["unknown-role"] },
        { label: "duplicate value", value: ["deployment-runtime", "deployment-runtime"] },
        { label: "noncanonical order", value: ["sandbox-worker", "deployment-runtime"] },
      ];

      for (const representation of invalidRepresentations) {
        await expect(
          sql`
            UPDATE servers
            SET workload_roles = CAST(${JSON.stringify(representation.value)} AS jsonb)
            WHERE id = 'srv_constrained_roles'
          `.execute(database.db),
          representation.label,
        ).rejects.toThrow("servers_workload_roles_canonical_check");
      }

      const row = await database.db
        .selectFrom("servers")
        .select("workload_roles")
        .where("id", "=", "srv_constrained_roles")
        .executeTakeFirstOrThrow();
      expect(row.workload_roles).toEqual([]);
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("[SRV-ROLE-PERSIST-001][SRV-ROLE-002] repository round-trips canonical roles and other server state", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-server-workload-roles-roundtrip-"));
    const { createDatabase, createMigrator, PgServerReadModel, PgServerRepository } = await import(
      "../src"
    );
    const database = await createDatabase({ driver: "pglite", pgliteDataDir: dataDir });

    try {
      expect((await createMigrator(database.db).migrateToLatest()).error).toBeUndefined();
      const repository = new PgServerRepository(database.db);
      const workloadRoles = DeploymentTargetWorkloadRoles.create([
        "sandbox-worker",
        "deployment-runtime",
        "artifact-builder",
      ])._unsafeUnwrap();
      const server = DeploymentTarget.register({
        id: DeploymentTargetId.rehydrate("srv_canonical_roles"),
        name: DeploymentTargetName.rehydrate("Canonical roles"),
        host: HostAddress.rehydrate("192.0.2.20"),
        port: PortNumber.rehydrate(2222),
        providerKey: ProviderKey.rehydrate("generic-ssh"),
        workloadRoles,
        createdAt: CreatedAt.rehydrate("2026-01-02T00:00:00.000Z"),
      })._unsafeUnwrap();

      await repository.upsert(
        createRepositoryContext(),
        server,
        UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
      );

      const persisted = await repository.findOne(
        createRepositoryContext(),
        DeploymentTargetByIdSpec.create(DeploymentTargetId.rehydrate("srv_canonical_roles")),
      );
      expect(persisted?.toState().workloadRoles.toJSON()).toEqual([
        "deployment-runtime",
        "artifact-builder",
        "sandbox-worker",
      ]);
      const summary = await new PgServerReadModel(database.db).findOne(
        createRepositoryContext(),
        DeploymentTargetByIdSpec.create(DeploymentTargetId.rehydrate("srv_canonical_roles")),
      );
      expect(summary?.workloadRoles).toEqual([
        "deployment-runtime",
        "artifact-builder",
        "sandbox-worker",
      ]);
      expect(persisted?.toState()).toMatchObject({
        name: { value: "Canonical roles" },
        host: { value: "192.0.2.20" },
        port: { value: 2222 },
        providerKey: { value: "generic-ssh" },
        lifecycleStatus: { value: "active" },
      });

      const row = await database.db
        .selectFrom("servers")
        .select("workload_roles")
        .where("id", "=", "srv_canonical_roles")
        .executeTakeFirstOrThrow();
      expect(row.workload_roles).toEqual([
        "deployment-runtime",
        "artifact-builder",
        "sandbox-worker",
      ]);
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("[SRV-ROLE-PERSIST-002][SRV-ROLE-003] upsert replaces persisted workload roles without changing other server state", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-server-workload-roles-update-"));
    const { createDatabase, createMigrator, PgServerRepository } = await import("../src");
    const database = await createDatabase({ driver: "pglite", pgliteDataDir: dataDir });

    try {
      expect((await createMigrator(database.db).migrateToLatest()).error).toBeUndefined();
      const repository = new PgServerRepository(database.db);
      const context = createRepositoryContext();
      const server = DeploymentTarget.register({
        id: DeploymentTargetId.rehydrate("srv_updated_roles"),
        name: DeploymentTargetName.rehydrate("Updated roles"),
        host: HostAddress.rehydrate("192.0.2.30"),
        port: PortNumber.rehydrate(2200),
        providerKey: ProviderKey.rehydrate("generic-ssh"),
        workloadRoles: DeploymentTargetWorkloadRoles.create(["deployment-runtime"])._unsafeUnwrap(),
        createdAt: CreatedAt.rehydrate("2026-01-03T00:00:00.000Z"),
      })._unsafeUnwrap();
      await repository.upsert(
        context,
        server,
        UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
      );

      server
        .configureWorkloadRoles({
          workloadRoles: DeploymentTargetWorkloadRoles.create([
            "sandbox-worker",
            "artifact-builder",
          ])._unsafeUnwrap(),
          configuredAt: UpdatedAt.rehydrate("2026-01-03T00:01:00.000Z"),
        })
        ._unsafeUnwrap();
      await repository.upsert(
        context,
        server,
        UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
      );

      const persisted = await repository.findOne(
        context,
        DeploymentTargetByIdSpec.create(DeploymentTargetId.rehydrate("srv_updated_roles")),
      );
      expect(persisted?.toState().workloadRoles.toJSON()).toEqual([
        "artifact-builder",
        "sandbox-worker",
      ]);
      expect(persisted?.toState()).toMatchObject({
        name: { value: "Updated roles" },
        host: { value: "192.0.2.30" },
        port: { value: 2200 },
        providerKey: { value: "generic-ssh" },
        lifecycleStatus: { value: "active" },
        createdAt: { value: "2026-01-03T00:00:00.000Z" },
      });
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
