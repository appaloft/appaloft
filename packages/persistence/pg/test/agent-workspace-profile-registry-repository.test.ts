import "reflect-metadata";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import {
  AgentWorkspaceProfileCanonicalManifest,
  AgentWorkspaceProfileDefinition,
  AgentWorkspaceProfileDefinitionDigest,
  AgentWorkspaceProfileDisplayName,
  AgentWorkspaceProfileId,
  AgentWorkspaceProfileInstallation,
  AgentWorkspaceProfileInstallationId,
  AgentWorkspaceProfileVersion,
  CreatedAt,
} from "@appaloft/core";
import {
  createDatabase,
  createMigrator,
  PgAgentWorkspaceProfileInstallationReferenceReader,
  PgAgentWorkspaceProfileRegistryRepository,
} from "../src";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
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

const profileDigest = `sha256:${"a".repeat(64)}`;
const adapterDigest = `sha256:${"b".repeat(64)}`;
const installedAt = "2026-07-26T12:00:00.000Z";

function definition() {
  return AgentWorkspaceProfileDefinition.register({
    id: AgentWorkspaceProfileDefinitionDigest.rehydrate(profileDigest),
    profileId: AgentWorkspaceProfileId.rehydrate("codex-default"),
    profileVersion: AgentWorkspaceProfileVersion.rehydrate("1.0.0"),
    displayName: AgentWorkspaceProfileDisplayName.rehydrate("Codex Default"),
    canonicalManifest: AgentWorkspaceProfileCanonicalManifest.rehydrate(
      JSON.stringify({
        schemaVersion: "appaloft.agent-workspace-profile/v1",
        id: "codex-default",
      }),
    ),
    registeredAt: CreatedAt.rehydrate(installedAt),
  })._unsafeUnwrap();
}

function installation(id: string) {
  return AgentWorkspaceProfileInstallation.install({
    id: AgentWorkspaceProfileInstallationId.rehydrate(id),
    definitionDigest: AgentWorkspaceProfileDefinitionDigest.rehydrate(profileDigest),
    profileId: AgentWorkspaceProfileId.rehydrate("codex-default"),
    profileVersion: AgentWorkspaceProfileVersion.rehydrate("1.0.0"),
    installedAt: CreatedAt.rehydrate(installedAt),
  })._unsafeUnwrap();
}

describe("PgAgentWorkspaceProfileRegistryRepository", () => {
  test("[PROFILE-PIN-010][ADAPTER-DISABLE-008] persists tenant Profiles and fences active pins", async () => {
    const directory = mkdtempSync(join(tmpdir(), "appaloft-agent-profile-pg-"));
    directories.push(directory);
    const database = await createDatabase({ driver: "pglite", pgliteDataDir: directory });
    try {
      expect((await createMigrator(database.db).migrateToLatest()).error).toBeUndefined();
      const repository = new PgAgentWorkspaceProfileRegistryRepository(database.db);
      const references = new PgAgentWorkspaceProfileInstallationReferenceReader(database.db);
      const tenantA = context("tenant_a");
      const tenantB = context("tenant_b");

      expect((await repository.saveDefinition(definition())).isOk()).toBe(true);
      expect(
        (await repository.saveInstallation(tenantA, installation("awpi_a"), null)).isOk(),
      ).toBe(true);
      expect(
        (await repository.saveInstallation(tenantB, installation("awpi_b"), null)).isOk(),
      ).toBe(true);
      expect(await repository.findInstallation(tenantA, "awpi_b")).toBeNull();
      expect(
        (await repository.listInstallations(tenantA, 100)).map((item) => item.id.value),
      ).toEqual(["awpi_a"]);

      await database.db
        .insertInto("agent_adapter_definitions")
        .values({
          digest: adapterDigest,
          adapter_id: "codex",
          adapter_version: "1.0.0",
          display_name: "Codex",
          canonical_manifest: "{}",
          registered_at: installedAt,
        })
        .execute();
      await database.db
        .insertInto("agent_adapter_installations")
        .values({
          tenant_id: "tenant_a",
          id: "aai_a",
          definition_digest: adapterDigest,
          adapter_id: "codex",
          adapter_version: "1.0.0",
          status: "enabled",
          revision: 0,
          installed_at: installedAt,
          updated_at: installedAt,
        })
        .execute();
      await database.db
        .insertInto("agent_workspace_profile_references")
        .values({
          tenant_id: "tenant_a",
          installation_id: "awpi_a",
          adapter_installation_id: "aai_a",
          workspace_id: "sbx_active",
          runtime_id: "sar_active",
          active: true,
          pin: { profileInstallationId: "awpi_a" },
          created_at: installedAt,
          released_at: null,
        })
        .execute();

      expect(await references.countActiveWorkspaceReferences(tenantA, "awpi_a")).toBe(1);
      expect((await repository.deleteInstallation(tenantA, "awpi_a")).isErr()).toBe(true);
      await database.db
        .updateTable("agent_workspace_profile_references")
        .set({
          active: false,
          released_at: "2026-07-26T13:00:00.000Z",
        })
        .where("tenant_id", "=", "tenant_a")
        .where("runtime_id", "=", "sar_active")
        .execute();
      expect((await repository.deleteInstallation(tenantA, "awpi_a")).isOk()).toBe(true);
      expect(await repository.findInstallation(tenantB, "awpi_b")).not.toBeNull();
    } finally {
      await database.close();
    }
  });
});
