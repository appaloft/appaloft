import { type Kysely, sql } from "kysely";
import { type Database } from "../schema";

export const agentAdapterInstallationsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`CREATE TABLE IF NOT EXISTS agent_adapter_definitions (
      digest TEXT PRIMARY KEY,
      adapter_id TEXT NOT NULL,
      adapter_version TEXT NOT NULL,
      display_name TEXT NOT NULL,
      canonical_manifest TEXT NOT NULL,
      registered_at TIMESTAMPTZ NOT NULL
    )`.execute(db);
    await sql`CREATE TABLE IF NOT EXISTS agent_adapter_installations (
      tenant_id TEXT NOT NULL,
      id TEXT NOT NULL,
      definition_digest TEXT NOT NULL REFERENCES agent_adapter_definitions(digest) ON DELETE RESTRICT,
      adapter_id TEXT NOT NULL,
      adapter_version TEXT NOT NULL,
      status TEXT NOT NULL,
      revision INTEGER NOT NULL,
      installed_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (tenant_id, id),
      UNIQUE (tenant_id, definition_digest)
    )`.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS agent_adapter_installations_tenant_status_idx
      ON agent_adapter_installations (tenant_id, status, installed_at DESC)`.execute(db);
    await sql`CREATE TABLE IF NOT EXISTS agent_adapter_workspace_references (
      tenant_id TEXT NOT NULL,
      installation_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      active BOOLEAN NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      released_at TIMESTAMPTZ,
      PRIMARY KEY (tenant_id, workspace_id),
      FOREIGN KEY (tenant_id, installation_id)
        REFERENCES agent_adapter_installations(tenant_id, id) ON DELETE RESTRICT
    )`.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS agent_adapter_workspace_references_active_idx
      ON agent_adapter_workspace_references (tenant_id, installation_id)
      WHERE active = TRUE`.execute(db);
  },
  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP TABLE IF EXISTS agent_adapter_workspace_references`.execute(db);
    await sql`DROP TABLE IF EXISTS agent_adapter_installations`.execute(db);
    await sql`DROP TABLE IF EXISTS agent_adapter_definitions`.execute(db);
  },
};
