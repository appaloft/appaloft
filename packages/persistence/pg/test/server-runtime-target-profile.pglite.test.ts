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
  HostAddress,
  PortNumber,
  ProviderKey,
  RuntimeTargetProfile,
  TargetKindValue,
  UpdatedAt,
  UpsertDeploymentTargetSpec,
} from "@appaloft/core";
import { sql } from "kysely";

function repositoryContext() {
  return toRepositoryContext(
    createExecutionContext({
      entrypoint: "system",
      requestId: "req_runtime_target_profile_persistence",
    }),
  );
}

function profile() {
  return RuntimeTargetProfile.create({
    connectionReference: "file:///tmp/appaloft-r5a.kubeconfig",
    credentialReference: "secret://cluster/r5a",
    placementPolicyReference: "policy://placement/default",
    routingPolicyReference: "policy://routing/gateway-api",
  })._unsafeUnwrap();
}

describe("runtime target profile persistence", () => {
  test("[K8S-PROFILE-001] repository and read model round-trip opaque references", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-target-profile-"));
    const { createDatabase, createMigrator, PgServerReadModel, PgServerRepository } = await import(
      "../src"
    );
    const database = await createDatabase({ driver: "pglite", pgliteDataDir: dataDir });

    try {
      expect((await createMigrator(database.db).migrateToLatest()).error).toBeUndefined();
      const context = repositoryContext();
      const repository = new PgServerRepository(database.db);
      const target = DeploymentTarget.register({
        id: DeploymentTargetId.rehydrate("srv_r5a_cluster"),
        name: DeploymentTargetName.rehydrate("R5a cluster"),
        host: HostAddress.rehydrate("kubernetes.invalid"),
        port: PortNumber.rehydrate(6443),
        providerKey: ProviderKey.rehydrate("kubernetes"),
        targetKind: TargetKindValue.rehydrate("orchestrator-cluster"),
        createdAt: CreatedAt.rehydrate("2026-08-13T00:00:00.000Z"),
      })._unsafeUnwrap();
      target
        .configureRuntimeTargetProfile({
          profile: profile(),
          configuredAt: UpdatedAt.rehydrate("2026-08-13T00:01:00.000Z"),
        })
        ._unsafeUnwrap();

      await repository.upsert(
        context,
        target,
        UpsertDeploymentTargetSpec.fromDeploymentTarget(target),
      );

      const persisted = await repository.findOne(
        context,
        DeploymentTargetByIdSpec.create(DeploymentTargetId.rehydrate("srv_r5a_cluster")),
      );
      expect(persisted?.toState().runtimeTargetProfile?.toSnapshot()).toEqual(
        profile().toSnapshot(),
      );

      const summary = await new PgServerReadModel(database.db).findOne(
        context,
        DeploymentTargetByIdSpec.create(DeploymentTargetId.rehydrate("srv_r5a_cluster")),
      );
      expect(summary?.runtimeTargetProfile).toEqual(profile().toSnapshot());

      const row = await database.db
        .selectFrom("servers")
        .select("runtime_target_profile")
        .where("id", "=", "srv_r5a_cluster")
        .executeTakeFirstOrThrow();
      expect(row.runtime_target_profile).toEqual(profile().toSnapshot());
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("[K8S-PROFILE-001] database rejects inline provider and secret payloads", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-runtime-target-profile-constraint-"));
    const { createDatabase, createMigrator } = await import("../src");
    const database = await createDatabase({ driver: "pglite", pgliteDataDir: dataDir });

    try {
      expect((await createMigrator(database.db).migrateToLatest()).error).toBeUndefined();

      await expect(
        sql`
          INSERT INTO servers (
            id, name, host, port, provider_key, target_kind, runtime_target_profile, created_at
          ) VALUES (
            'srv_inline_profile', 'Inline', 'kubernetes.invalid', 6443, 'kubernetes',
            'orchestrator-cluster',
            ${JSON.stringify({
              schemaVersion: "runtime-target-profile/v1",
              connectionReference: "apiVersion: v1\nclusters: []",
              kubeconfig: "secret-inline-payload",
            })}::jsonb,
            '2026-08-13T00:00:00.000Z'
          )
        `.execute(database.db),
      ).rejects.toThrow("servers_runtime_target_profile_shape_check");
    } finally {
      await database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
