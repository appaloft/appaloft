import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import {
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetId,
  DeploymentTargetName,
  HostAddress,
  PortNumber,
  ProviderKey,
  ServerByIdSpec,
  UpsertDeploymentTargetSpec,
} from "@appaloft/core";

function createOrganizationContext(input: { organizationId: string; userId: string }) {
  return toRepositoryContext(
    createExecutionContext({
      entrypoint: "rpc",
      requestId: `req_server_ownership_${input.organizationId}_${input.userId}`,
      principal: {
        kind: "user",
        actorId: input.userId,
        userId: input.userId,
        activeOrganization: {
          organizationId: input.organizationId,
          role: "owner",
          productRole: "owner",
        },
      },
    }),
  );
}

function createSystemContext() {
  return toRepositoryContext(
    createExecutionContext({
      entrypoint: "system",
      requestId: "req_server_ownership_system",
    }),
  );
}

function server(input: { id: string; name: string; host: string }) {
  return DeploymentTarget.register({
    id: DeploymentTargetId.rehydrate(input.id),
    name: DeploymentTargetName.rehydrate(input.name),
    host: HostAddress.rehydrate(input.host),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate("generic-ssh"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();
}

describe("server organization ownership persistence", () => {
  test("[SERVER-OWN-001] repository and read model scope servers to context organization", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-server-ownership-"));
    const { createDatabase, createMigrator, PgServerReadModel, PgServerRepository } = await import(
      "../src"
    );
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const repository = new PgServerRepository(database.db);
      const readModel = new PgServerReadModel(database.db);
      const systemContext = createSystemContext();
      const alphaContext = createOrganizationContext({
        organizationId: "org_alpha",
        userId: "usr_alpha",
      });
      const betaContext = createOrganizationContext({
        organizationId: "org_beta",
        userId: "usr_beta",
      });
      const alphaServer = server({
        id: "srv_alpha_rack",
        name: "Alpha Rack",
        host: "10.0.0.10",
      });
      const betaServer = server({
        id: "srv_beta_rack",
        name: "Beta Rack",
        host: "10.0.1.10",
      });

      await repository.upsert(
        alphaContext,
        alphaServer,
        UpsertDeploymentTargetSpec.fromDeploymentTarget(alphaServer),
      );
      await repository.upsert(
        betaContext,
        betaServer,
        UpsertDeploymentTargetSpec.fromDeploymentTarget(betaServer),
      );

      await expect(readModel.list(alphaContext)).resolves.toEqual([
        expect.objectContaining({ id: "srv_alpha_rack" }),
      ]);
      await expect(readModel.list(betaContext)).resolves.toEqual([
        expect.objectContaining({ id: "srv_beta_rack" }),
      ]);
      await expect(
        readModel.findOne(
          alphaContext,
          ServerByIdSpec.create(DeploymentTargetId.rehydrate("srv_beta_rack")),
        ),
      ).resolves.toBeNull();
      await expect(
        repository.findOne(
          alphaContext,
          ServerByIdSpec.create(DeploymentTargetId.rehydrate("srv_beta_rack")),
        ),
      ).resolves.toBeNull();
      await expect(readModel.list(systemContext)).resolves.toHaveLength(2);
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });
});
