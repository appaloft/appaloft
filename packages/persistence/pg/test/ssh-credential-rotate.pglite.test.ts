import { describe, expect, test } from "bun:test";
import "reflect-metadata";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createExecutionContext,
  type RepositoryContext,
  toRepositoryContext,
} from "@appaloft/application";
import {
  CreatedAt,
  DeploymentTargetCredentialKindValue,
  DeploymentTargetUsername,
  RotatedAt,
  RotateSshCredentialSpec,
  SshCredential,
  SshCredentialByIdSpec,
  SshCredentialId,
  SshCredentialName,
  SshPrivateKeyText,
  SshPublicKeyText,
} from "@appaloft/core";

function createRepositoryContext(): RepositoryContext {
  return toRepositoryContext(
    createExecutionContext({
      entrypoint: "system",
      requestId: "req_pg_ssh_credential_rotate_test",
    }),
  );
}

function normalizeTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

async function createRotatedCredential() {
  const credentialResult = SshCredential.create({
    id: SshCredentialId.rehydrate("cred_primary"),
    name: SshCredentialName.rehydrate("primary-key"),
    kind: DeploymentTargetCredentialKindValue.rehydrate("ssh-private-key"),
    username: DeploymentTargetUsername.rehydrate("deploy-new"),
    publicKey: SshPublicKeyText.rehydrate("ssh-ed25519 NEW_PUBLIC"),
    privateKey: SshPrivateKeyText.rehydrate("NEW_PRIVATE"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });

  expect(credentialResult.isOk()).toBe(true);
  const credential = credentialResult._unsafeUnwrap();
  const rotatedAt = RotatedAt.rehydrate("2026-01-01T00:00:10.000Z");
  const rotateResult = credential.rotate({
    privateKey: SshPrivateKeyText.rehydrate("NEW_PRIVATE"),
    publicKey: SshPublicKeyText.rehydrate("ssh-ed25519 NEW_PUBLIC"),
    username: DeploymentTargetUsername.rehydrate("deploy-new"),
    rotatedAt,
  });

  expect(rotateResult.isOk()).toBe(true);
  return credential;
}

async function createDatabaseHarness() {
  const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-ssh-credential-rotate-"));
  const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
  const { createDatabase, createMigrator, PgSshCredentialReadModel, PgSshCredentialRepository } =
    await import("../src/index");
  const database = await createDatabase({
    driver: "pglite",
    pgliteDataDir,
  });

  await createMigrator(database.db).migrateToLatest();
  await database.db
    .insertInto("ssh_credentials")
    .values({
      id: "cred_primary",
      name: "primary-key",
      kind: "ssh-private-key",
      username: "deploy",
      public_key: "ssh-ed25519 OLD_PUBLIC",
      private_key: "OLD_PRIVATE",
      created_at: "2026-01-01T00:00:00.000Z",
    })
    .execute();

  return {
    database,
    readModel: new PgSshCredentialReadModel(database.db),
    repository: new PgSshCredentialRepository(database.db),
  };
}

describe("ssh credential rotate pglite integration", () => {
  test("[SSH-CRED-ROTATE-007] pglite rotates credential material while preserving server references", async () => {
    const context = createRepositoryContext();
    const { database, readModel, repository } = await createDatabaseHarness();

    try {
      await database.db
        .insertInto("servers")
        .values([
          {
            id: "srv_active",
            name: "Active",
            host: "203.0.113.10",
            port: 22,
            provider_key: "generic-ssh",
            lifecycle_status: "active",
            credential_id: "cred_primary",
            credential_kind: "ssh-private-key",
            credential_username: null,
            credential_public_key: null,
            credential_private_key: null,
            created_at: "2026-01-01T00:01:00.000Z",
          },
          {
            id: "srv_inactive",
            name: "Inactive",
            host: "203.0.113.11",
            port: 22,
            provider_key: "generic-ssh",
            lifecycle_status: "inactive",
            credential_id: "cred_primary",
            credential_kind: "ssh-private-key",
            credential_username: null,
            credential_public_key: null,
            credential_private_key: null,
            created_at: "2026-01-01T00:02:00.000Z",
          },
          {
            id: "srv_deleted",
            name: "Deleted",
            host: "203.0.113.12",
            port: 22,
            provider_key: "generic-ssh",
            lifecycle_status: "deleted",
            credential_id: "cred_primary",
            credential_kind: "ssh-private-key",
            credential_username: null,
            credential_public_key: null,
            credential_private_key: null,
            created_at: "2026-01-01T00:03:00.000Z",
          },
          {
            id: "srv_direct_key",
            name: "Direct Key",
            host: "203.0.113.13",
            port: 22,
            provider_key: "generic-ssh",
            lifecycle_status: "active",
            credential_id: null,
            credential_kind: "ssh-private-key",
            credential_username: "direct",
            credential_public_key: "ssh-ed25519 DIRECT_PUBLIC",
            credential_private_key: "DIRECT_PRIVATE",
            created_at: "2026-01-01T00:04:00.000Z",
          },
        ])
        .execute();

      const credential = await createRotatedCredential();
      const result = await repository.updateOne(
        context,
        credential,
        RotateSshCredentialSpec.fromSshCredential(credential),
      );
      const rotatedRow = await database.db
        .selectFrom("ssh_credentials")
        .select(["id", "username", "public_key", "private_key", "created_at", "rotated_at"])
        .where("id", "=", "cred_primary")
        .executeTakeFirstOrThrow();
      const servers = await database.db
        .selectFrom("servers")
        .select(["id", "credential_id", "credential_kind", "credential_private_key"])
        .orderBy("id")
        .execute();
      const readCredential = await readModel.findOne(
        context,
        SshCredentialByIdSpec.create(SshCredentialId.rehydrate("cred_primary")),
      );

      expect(result).toBe(true);
      expect({
        ...rotatedRow,
        created_at: normalizeTimestamp(rotatedRow.created_at),
        rotated_at: rotatedRow.rotated_at ? normalizeTimestamp(rotatedRow.rotated_at) : null,
      }).toEqual({
        id: "cred_primary",
        username: "deploy-new",
        public_key: "ssh-ed25519 NEW_PUBLIC",
        private_key: "NEW_PRIVATE",
        created_at: "2026-01-01T00:00:00.000Z",
        rotated_at: "2026-01-01T00:00:10.000Z",
      });
      expect(servers).toEqual([
        {
          id: "srv_active",
          credential_id: "cred_primary",
          credential_kind: "ssh-private-key",
          credential_private_key: null,
        },
        {
          id: "srv_deleted",
          credential_id: "cred_primary",
          credential_kind: "ssh-private-key",
          credential_private_key: null,
        },
        {
          id: "srv_direct_key",
          credential_id: null,
          credential_kind: "ssh-private-key",
          credential_private_key: "DIRECT_PRIVATE",
        },
        {
          id: "srv_inactive",
          credential_id: "cred_primary",
          credential_kind: "ssh-private-key",
          credential_private_key: null,
        },
      ]);
      expect(readCredential).toMatchObject({
        id: "cred_primary",
        username: "deploy-new",
        publicKeyConfigured: true,
        privateKeyConfigured: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        rotatedAt: "2026-01-01T00:00:10.000Z",
      });
      expect(JSON.stringify(readCredential)).not.toContain("NEW_PRIVATE");
      expect(JSON.stringify(readCredential)).not.toContain("NEW_PUBLIC");
    } finally {
      await database.close();
    }
  });

  test("[SSH-CRED-ROTATE-008] pglite update returns false when the selected credential is absent", async () => {
    const context = createRepositoryContext();
    const { database, repository } = await createDatabaseHarness();

    try {
      const credential = await createRotatedCredential();
      await database.db.deleteFrom("ssh_credentials").where("id", "=", "cred_primary").execute();

      const result = await repository.updateOne(
        context,
        credential,
        RotateSshCredentialSpec.fromSshCredential(credential),
      );

      expect(result).toBe(false);
    } finally {
      await database.close();
    }
  });
});
