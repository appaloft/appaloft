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
import { SshCredentialByIdSpec, SshCredentialId } from "@appaloft/core";

function createRepositoryContext(): RepositoryContext {
  return toRepositoryContext(
    createExecutionContext({
      entrypoint: "system",
      requestId: "req_pg_ssh_credential_read_model_test",
    }),
  );
}

describe("ssh credential read model pglite integration", () => {
  test("[SSH-CRED-SHOW-008] pglite reads masked credential detail and reusable server usage", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-ssh-credential-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    const context = createRepositoryContext();
    const { createDatabase, createMigrator, PgSshCredentialReadModel, PgSshCredentialUsageReader } =
      await import("../src/index");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir,
    });

    try {
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
            credential_username: "override",
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

      const readModel = new PgSshCredentialReadModel(database.db);
      const usageReader = new PgSshCredentialUsageReader(database.db);
      const credential = await readModel.findOne(
        context,
        SshCredentialByIdSpec.create(SshCredentialId.rehydrate("cred_primary")),
      );
      const usage = await usageReader.listByCredentialId(context, "cred_primary");

      expect(credential).toEqual({
        id: "cred_primary",
        name: "primary-key",
        kind: "ssh-private-key",
        username: "deploy",
        publicKeyConfigured: true,
        privateKeyConfigured: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      expect(JSON.stringify(credential)).not.toContain("PRIVATE_KEY_SHOULD_NOT_LEAK");
      expect(JSON.stringify(credential)).not.toContain("AAAA_PUBLIC_KEY_SHOULD_NOT_LEAK");
      expect(usage).toEqual([
        {
          serverId: "srv_inactive",
          serverName: "Inactive",
          lifecycleStatus: "inactive",
          providerKey: "generic-ssh",
          host: "203.0.113.11",
          username: "override",
        },
        {
          serverId: "srv_active",
          serverName: "Active",
          lifecycleStatus: "active",
          providerKey: "generic-ssh",
          host: "203.0.113.10",
          username: "deploy",
        },
      ]);
    } finally {
      await database.close();
    }
  });
});
