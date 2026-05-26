import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import {
  CreatedAt,
  DeploymentTargetCredentialKindValue,
  SshCredential,
  SshCredentialByIdSpec,
  SshCredentialId,
  SshCredentialName,
  SshPrivateKeyText,
  UnusedSshCredentialByIdSpec,
  UpsertSshCredentialSpec,
} from "@appaloft/core";

import {
  createDatabase,
  createMigrator,
  PgSshCredentialReadModel,
  PgSshCredentialRepository,
  PgSshCredentialUsageReader,
} from "../src";

function organizationContext(organizationId: string, userId: string) {
  return toRepositoryContext(
    createExecutionContext({
      entrypoint: "system",
      requestId: `req_ssh_credential_ownership_${organizationId}_${userId}`,
      principal: {
        kind: "user",
        actorId: userId,
        userId,
        activeOrganization: {
          organizationId,
          role: "owner",
          productRole: "owner",
        },
      },
    }),
  );
}

function createCredential(id: string, name: string) {
  return SshCredential.create({
    id: SshCredentialId.rehydrate(id),
    name: SshCredentialName.rehydrate(name),
    kind: DeploymentTargetCredentialKindValue.rehydrate("ssh-private-key"),
    privateKey: SshPrivateKeyText.rehydrate(`${id}_PRIVATE_KEY`),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();
}

describe("ssh credential organization ownership persistence", () => {
  test("[SSH-CRED-OWN-001] repository and read model scope credentials and usage to context organization", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-ssh-credential-ownership-"));
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const repository = new PgSshCredentialRepository(database.db);
      const readModel = new PgSshCredentialReadModel(database.db);
      const usageReader = new PgSshCredentialUsageReader(database.db);
      const alphaContext = organizationContext("org_alpha", "usr_alpha_owner");
      const betaContext = organizationContext("org_beta", "usr_beta_owner");
      const alphaCredential = createCredential("sshcred_alpha", "Alpha SSH key");
      const betaCredential = createCredential("sshcred_beta", "Beta SSH key");

      await repository.upsert(
        alphaContext,
        alphaCredential,
        UpsertSshCredentialSpec.fromSshCredential(alphaCredential),
      );
      await repository.upsert(
        betaContext,
        betaCredential,
        UpsertSshCredentialSpec.fromSshCredential(betaCredential),
      );

      await database.db
        .insertInto("servers")
        .values([
          {
            id: "srv_alpha",
            organization_id: "org_alpha",
            name: "Alpha Rack",
            host: "10.0.0.10",
            port: 22,
            provider_key: "generic-ssh",
            target_kind: "remote-docker",
            lifecycle_status: "active",
            credential_id: "sshcred_alpha",
            credential_kind: "ssh-private-key",
            credential_username: null,
            credential_public_key: null,
            credential_private_key: null,
            created_at: "2026-01-01T00:01:00.000Z",
          },
          {
            id: "srv_beta",
            organization_id: "org_beta",
            name: "Beta Rack",
            host: "10.0.1.10",
            port: 22,
            provider_key: "generic-ssh",
            target_kind: "remote-docker",
            lifecycle_status: "active",
            credential_id: "sshcred_beta",
            credential_kind: "ssh-private-key",
            credential_username: null,
            credential_public_key: null,
            credential_private_key: null,
            created_at: "2026-01-01T00:02:00.000Z",
          },
        ])
        .execute();

      expect((await readModel.list(alphaContext)).map((credential) => credential.id)).toEqual([
        "sshcred_alpha",
      ]);
      expect((await readModel.list(betaContext)).map((credential) => credential.id)).toEqual([
        "sshcred_beta",
      ]);
      expect(
        await readModel.findOne(
          alphaContext,
          SshCredentialByIdSpec.create(SshCredentialId.rehydrate("sshcred_beta")),
        ),
      ).toBeNull();
      expect(
        await repository.findOne(
          alphaContext,
          SshCredentialByIdSpec.create(SshCredentialId.rehydrate("sshcred_beta")),
        ),
      ).toBeNull();
      expect(
        (await usageReader.listByCredentialId(alphaContext, "sshcred_alpha")).map(
          (usage) => usage.serverId,
        ),
      ).toEqual(["srv_alpha"]);
      expect(await usageReader.listByCredentialId(alphaContext, "sshcred_beta")).toEqual([]);
      expect(
        await repository.deleteOne(
          alphaContext,
          UnusedSshCredentialByIdSpec.create(SshCredentialId.rehydrate("sshcred_beta")),
        ),
      ).toBe(false);
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  });
});
