import "reflect-metadata";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import {
  AgentAdapterCanonicalManifest,
  AgentAdapterDefinition,
  AgentAdapterDefinitionDigest,
  AgentAdapterDisplayName,
  AgentAdapterId,
  AgentAdapterInstallation,
  AgentAdapterInstallationId,
  AgentAdapterVersion,
  CreatedAt,
} from "@appaloft/core";
import {
  createDatabase,
  createMigrator,
  PgAgentAdapterInstallationReferenceReader,
  PgAgentAdapterRegistryRepository,
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

const digest = `sha256:${"a".repeat(64)}`;
const installedAt = "2026-07-26T12:00:00.000Z";

function definition() {
  return AgentAdapterDefinition.register({
    id: AgentAdapterDefinitionDigest.rehydrate(digest),
    adapterId: AgentAdapterId.rehydrate("codex"),
    adapterVersion: AgentAdapterVersion.rehydrate("1.0.0"),
    displayName: AgentAdapterDisplayName.rehydrate("Codex"),
    canonicalManifest: AgentAdapterCanonicalManifest.rehydrate(
      JSON.stringify({ schemaVersion: "appaloft.agent-adapter/v1", id: "codex" }),
    ),
    registeredAt: CreatedAt.rehydrate(installedAt),
  })._unsafeUnwrap();
}

function installation(id: string) {
  return AgentAdapterInstallation.install({
    id: AgentAdapterInstallationId.rehydrate(id),
    definitionDigest: AgentAdapterDefinitionDigest.rehydrate(digest),
    adapterId: AgentAdapterId.rehydrate("codex"),
    adapterVersion: AgentAdapterVersion.rehydrate("1.0.0"),
    installedAt: CreatedAt.rehydrate(installedAt),
  })._unsafeUnwrap();
}

describe("PgAgentAdapterRegistryRepository", () => {
  test("[ADAPTER-INSTALL-007][ADAPTER-DISABLE-008] persists shared definitions, tenant installations and active-reference fences", async () => {
    const directory = mkdtempSync(join(tmpdir(), "appaloft-agent-adapter-pg-"));
    directories.push(directory);
    const database = await createDatabase({ driver: "pglite", pgliteDataDir: directory });
    try {
      expect((await createMigrator(database.db).migrateToLatest()).error).toBeUndefined();
      const repository = new PgAgentAdapterRegistryRepository(database.db);
      const references = new PgAgentAdapterInstallationReferenceReader(database.db);
      const tenantA = context("tenant_a");
      const tenantB = context("tenant_b");

      expect((await repository.saveDefinition(definition())).isOk()).toBe(true);
      expect((await repository.saveDefinition(definition())).isOk()).toBe(true);
      expect((await repository.saveInstallation(tenantA, installation("aai_a"), null)).isOk()).toBe(
        true,
      );
      expect((await repository.saveInstallation(tenantB, installation("aai_b"), null)).isOk()).toBe(
        true,
      );
      expect(await repository.findInstallation(tenantA, "aai_b")).toBeNull();
      expect(
        (await repository.listInstallations(tenantA, 100)).map((item) => item.id.value),
      ).toEqual(["aai_a"]);

      await database.db
        .insertInto("agent_adapter_workspace_references")
        .values({
          tenant_id: "tenant_a",
          installation_id: "aai_a",
          workspace_id: "sbx_active",
          active: true,
          created_at: installedAt,
          released_at: null,
        })
        .execute();
      expect(await references.countActiveWorkspaceReferences(tenantA, "aai_a")).toBe(1);
      expect(await references.countActiveWorkspaceReferences(tenantB, "aai_b")).toBe(0);
      expect((await repository.deleteInstallation(tenantA, "aai_a")).isErr()).toBe(true);

      await database.db
        .updateTable("agent_adapter_workspace_references")
        .set({
          active: false,
          released_at: "2026-07-26T13:00:00.000Z",
        })
        .where("tenant_id", "=", "tenant_a")
        .where("workspace_id", "=", "sbx_active")
        .execute();
      expect((await repository.deleteInstallation(tenantA, "aai_a")).isOk()).toBe(true);
      expect(await repository.findInstallation(tenantA, "aai_a")).toBeNull();
      expect(await repository.findInstallation(tenantB, "aai_b")).not.toBeNull();
    } finally {
      await database.close();
    }
  });
});
