import { sql, type Kysely } from "kysely";
import { type Database } from "../schema";

export const profileAwareWorkspaceOpenMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS default_workspace_profile_installation_id TEXT`.execute(db);
    await sql`ALTER TABLE agent_workspace_profile_installations
      ADD COLUMN IF NOT EXISTS credential_connections JSONB NOT NULL DEFAULT '[]'::jsonb`.execute(
      db,
    );
    await sql`CREATE TABLE IF NOT EXISTS repository_bindings (
      tenant_id TEXT NOT NULL,
      id TEXT NOT NULL,
      repository_identity TEXT NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      unbound_at TIMESTAMPTZ,
      PRIMARY KEY (tenant_id, id),
      UNIQUE (tenant_id, repository_identity)
    )`.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS repository_bindings_project_idx
      ON repository_bindings (tenant_id, project_id, status)`.execute(db);
    await sql`CREATE TABLE IF NOT EXISTS workspace_open_entries (
      tenant_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
      repository_identity TEXT NOT NULL,
      branch TEXT NOT NULL,
      generation INTEGER NOT NULL,
      commit_sha TEXT NOT NULL,
      profile_installation_id TEXT NOT NULL,
      workspace_id TEXT,
      runtime_id TEXT,
      status TEXT NOT NULL,
      phase TEXT NOT NULL,
      error_code TEXT,
      preferred BOOLEAN NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (
        tenant_id,
        subject_id,
        project_id,
        repository_identity,
        branch,
        generation
      )
    )`.execute(db);
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS workspace_open_entries_preferred_idx
      ON workspace_open_entries (
        tenant_id,
        subject_id,
        project_id,
        repository_identity,
        branch
      )
      WHERE preferred = TRUE`.execute(db);
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS workspace_open_entries_workspace_idx
      ON workspace_open_entries (tenant_id, workspace_id)
      WHERE workspace_id IS NOT NULL`.execute(db);
  },
  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP TABLE IF EXISTS workspace_open_entries`.execute(db);
    await sql`DROP TABLE IF EXISTS repository_bindings`.execute(db);
    await sql`ALTER TABLE agent_workspace_profile_installations
      DROP COLUMN IF EXISTS credential_connections`.execute(db);
    await sql`ALTER TABLE projects
      DROP COLUMN IF EXISTS default_workspace_profile_installation_id`.execute(db);
  },
};
