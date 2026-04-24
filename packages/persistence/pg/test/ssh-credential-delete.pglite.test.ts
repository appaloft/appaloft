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
import { SshCredentialId, UnusedSshCredentialByIdSpec } from "@appaloft/core";

function createRepositoryContext(): RepositoryContext {
  return toRepositoryContext(
    createExecutionContext({
      entrypoint: "system",
      requestId: "req_pg_ssh_credential_delete_test",
    }),
  );
}

async function createDatabaseHarness() {
  const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-ssh-credential-delete-"));
  const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
  const { createDatabase, createMigrator, PgSshCredentialRepository } = await import(
    "../src/index"
  );
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
      public_key: "ssh-ed25519 AAAA_PUBLIC_KEY_SHOULD_NOT_LEAK",
      private_key: "-----BEGIN PRIVATE KEY-----PRIVATE_KEY_SHOULD_NOT_LEAK",
      created_at: "2026-01-01T00:00:00.000Z",
    })
    .execute();

  return {
    database,
    repository: new PgSshCredentialRepository(database.db),
  };
}

function credentialSpec() {
  return UnusedSshCredentialByIdSpec.create(SshCredentialId.rehydrate("cred_primary"));
}

describe("ssh credential delete pglite integration", () => {
  test("[SSH-CRED-DELETE-007] pglite deletes unused reusable SSH credentials only", async () => {
    const context = createRepositoryContext();
    const { database, repository } = await createDatabaseHarness();

    try {
      await database.db
        .insertInto("servers")
        .values([
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

      const result = await repository.deleteOne(context, credentialSpec());
      const credential = await database.db
        .selectFrom("ssh_credentials")
        .select(["id"])
        .where("id", "=", "cred_primary")
        .executeTakeFirst();
      const directServer = await database.db
        .selectFrom("servers")
        .select(["id", "credential_id", "credential_kind"])
        .where("id", "=", "srv_direct_key")
        .executeTakeFirstOrThrow();

      expect(result).toBe(true);
      expect(credential).toBeUndefined();
      expect(directServer).toMatchObject({
        id: "srv_direct_key",
        credential_id: null,
        credential_kind: "ssh-private-key",
      });
    } finally {
      await database.close();
    }
  });

  test("[SSH-CRED-DELETE-008] pglite guarded delete refuses active and inactive visible usage", async () => {
    const context = createRepositoryContext();
    const { database, repository } = await createDatabaseHarness();

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
        ])
        .execute();

      const result = await repository.deleteOne(context, credentialSpec());
      const credential = await database.db
        .selectFrom("ssh_credentials")
        .select(["id"])
        .where("id", "=", "cred_primary")
        .executeTakeFirst();
      const servers = await database.db
        .selectFrom("servers")
        .select(["id", "credential_id"])
        .orderBy("id")
        .execute();

      expect(result).toBe(false);
      expect(credential).toMatchObject({ id: "cred_primary" });
      expect(servers).toEqual([
        { id: "srv_active", credential_id: "cred_primary" },
        { id: "srv_inactive", credential_id: "cred_primary" },
      ]);
    } finally {
      await database.close();
    }
  });
});
