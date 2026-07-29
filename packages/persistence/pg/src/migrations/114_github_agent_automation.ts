import { type Kysely, sql } from "kysely";
import { type Database } from "../schema";

export const githubAgentAutomationMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`ALTER TABLE source_events
      ADD COLUMN IF NOT EXISTS agent_automation_claimed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS agent_automation_outcome JSONB`.execute(db);
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS source_events_github_delivery_unique
      ON source_events (source_kind, delivery_id)
      WHERE source_kind = 'github' AND delivery_id IS NOT NULL`.execute(db);
    await sql`CREATE TABLE IF NOT EXISTS github_agent_review_executions (
      tenant_id TEXT NOT NULL,
      execution_key TEXT NOT NULL,
      claimed_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (tenant_id, execution_key)
    )`.execute(db);
    await sql`CREATE TABLE IF NOT EXISTS github_agent_thread_tasks (
      tenant_id TEXT NOT NULL,
      thread_key TEXT NOT NULL,
      task JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (tenant_id, thread_key)
    )`.execute(db);
    await sql`CREATE TABLE IF NOT EXISTS repository_bindings (
      tenant_id TEXT NOT NULL,
      id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      installation_connection_id TEXT NOT NULL,
      provider_repository_id TEXT NOT NULL,
      state JSONB NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (tenant_id, id),
      UNIQUE (tenant_id, provider, provider_repository_id)
    )`.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS repository_bindings_project_status_idx
      ON repository_bindings (tenant_id, project_id, status, created_at DESC)`.execute(db);
    await sql`CREATE TABLE IF NOT EXISTS project_automation_rules (
      tenant_id TEXT NOT NULL,
      id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      repository_binding_id TEXT NOT NULL,
      state JSONB NOT NULL,
      status TEXT NOT NULL,
      revision INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (tenant_id, id),
      FOREIGN KEY (tenant_id, repository_binding_id)
        REFERENCES repository_bindings(tenant_id, id) ON DELETE RESTRICT
    )`.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS project_automation_rules_match_idx
      ON project_automation_rules
      (tenant_id, repository_binding_id, status, created_at DESC)`.execute(db);
    await sql`CREATE TABLE IF NOT EXISTS agent_profiles (
      tenant_id TEXT NOT NULL,
      id TEXT NOT NULL,
      state JSONB NOT NULL,
      adapter TEXT NOT NULL,
      credential_connection_id TEXT NOT NULL,
      status TEXT NOT NULL,
      revision INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (tenant_id, id)
    )`.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS agent_profiles_tenant_status_idx
      ON agent_profiles (tenant_id, status, created_at DESC)`.execute(db);
  },
  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP TABLE IF EXISTS agent_profiles`.execute(db);
    await sql`DROP TABLE IF EXISTS project_automation_rules`.execute(db);
    await sql`DROP TABLE IF EXISTS repository_bindings`.execute(db);
    await sql`DROP TABLE IF EXISTS github_agent_thread_tasks`.execute(db);
    await sql`DROP TABLE IF EXISTS github_agent_review_executions`.execute(db);
    await sql`DROP INDEX IF EXISTS source_events_github_delivery_unique`.execute(db);
    await sql`ALTER TABLE source_events
      DROP COLUMN IF EXISTS agent_automation_outcome,
      DROP COLUMN IF EXISTS agent_automation_claimed_at`.execute(db);
  },
};
