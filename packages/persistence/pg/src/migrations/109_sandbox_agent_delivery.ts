import { type Kysely, sql } from "kysely";
import { type Database } from "../schema";

export const sandboxAgentDeliveryMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`CREATE TABLE IF NOT EXISTS sandbox_agent_runtimes (
      tenant_id TEXT NOT NULL, id TEXT NOT NULL, sandbox_id TEXT NOT NULL,
      harness_key TEXT NOT NULL, idempotency_key TEXT NOT NULL, status TEXT NOT NULL,
      state JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (tenant_id, id), UNIQUE (tenant_id, sandbox_id, idempotency_key),
      FOREIGN KEY (tenant_id, sandbox_id) REFERENCES execution_sandboxes (tenant_id, id) ON DELETE RESTRICT
    )`.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS sandbox_agent_runtimes_parent_idx ON sandbox_agent_runtimes (tenant_id, sandbox_id, created_at DESC)`.execute(
      db,
    );
    await sql`CREATE TABLE IF NOT EXISTS sandbox_agent_runs (
      tenant_id TEXT NOT NULL, id TEXT NOT NULL, runtime_id TEXT NOT NULL, sandbox_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL, status TEXT NOT NULL, task_envelope TEXT NOT NULL,
      state JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (tenant_id, id), UNIQUE (tenant_id, runtime_id, idempotency_key),
      FOREIGN KEY (tenant_id, runtime_id) REFERENCES sandbox_agent_runtimes (tenant_id, id) ON DELETE RESTRICT
    )`.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS sandbox_agent_runs_parent_idx ON sandbox_agent_runs (tenant_id, runtime_id, created_at DESC)`.execute(
      db,
    );
    await sql`CREATE TABLE IF NOT EXISTS sandbox_agent_run_events (
      tenant_id TEXT NOT NULL, event_id TEXT NOT NULL, run_id TEXT NOT NULL,
      sequence INTEGER NOT NULL, type TEXT NOT NULL, data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (tenant_id, event_id), UNIQUE (tenant_id, run_id, sequence),
      FOREIGN KEY (tenant_id, run_id) REFERENCES sandbox_agent_runs (tenant_id, id) ON DELETE CASCADE
    )`.execute(db);
    await sql`CREATE TABLE IF NOT EXISTS sandbox_agent_approvals (
      tenant_id TEXT NOT NULL, id TEXT NOT NULL, runtime_id TEXT NOT NULL, run_id TEXT NOT NULL,
      sandbox_id TEXT NOT NULL, capability TEXT NOT NULL, request_digest TEXT NOT NULL,
      status TEXT NOT NULL, state JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (tenant_id, id), UNIQUE (tenant_id, run_id, request_digest),
      FOREIGN KEY (tenant_id, run_id) REFERENCES sandbox_agent_runs (tenant_id, id) ON DELETE CASCADE
    )`.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS sandbox_agent_approvals_parent_idx ON sandbox_agent_approvals (tenant_id, run_id, created_at DESC)`.execute(
      db,
    );
    await sql`CREATE TABLE IF NOT EXISTS sandbox_source_artifacts (
      tenant_id TEXT NOT NULL, id TEXT NOT NULL, sandbox_id TEXT NOT NULL, digest TEXT NOT NULL,
      status TEXT NOT NULL, state JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (tenant_id, id), UNIQUE (tenant_id, sandbox_id, digest),
      FOREIGN KEY (tenant_id, sandbox_id) REFERENCES execution_sandboxes (tenant_id, id) ON DELETE RESTRICT
    )`.execute(db);
    await sql`CREATE TABLE IF NOT EXISTS sandbox_candidate_previews (
      tenant_id TEXT NOT NULL, id TEXT NOT NULL, artifact_id TEXT NOT NULL, artifact_digest TEXT NOT NULL,
      status TEXT NOT NULL, state JSONB NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (tenant_id, id),
      FOREIGN KEY (tenant_id, artifact_id) REFERENCES sandbox_source_artifacts (tenant_id, id) ON DELETE RESTRICT
    )`.execute(db);
    await sql`CREATE TABLE IF NOT EXISTS sandbox_promotions (
      tenant_id TEXT NOT NULL, id TEXT NOT NULL, sandbox_id TEXT NOT NULL, artifact_id TEXT NOT NULL,
      artifact_digest TEXT NOT NULL, status TEXT NOT NULL, state JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (tenant_id, id),
      FOREIGN KEY (tenant_id, sandbox_id) REFERENCES execution_sandboxes (tenant_id, id) ON DELETE RESTRICT,
      FOREIGN KEY (tenant_id, artifact_id) REFERENCES sandbox_source_artifacts (tenant_id, id) ON DELETE RESTRICT
    )`.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS sandbox_promotions_parent_idx ON sandbox_promotions (tenant_id, sandbox_id, created_at DESC)`.execute(
      db,
    );
  },
  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP TABLE IF EXISTS sandbox_promotions`.execute(db);
    await sql`DROP TABLE IF EXISTS sandbox_candidate_previews`.execute(db);
    await sql`DROP TABLE IF EXISTS sandbox_source_artifacts`.execute(db);
    await sql`DROP TABLE IF EXISTS sandbox_agent_approvals`.execute(db);
    await sql`DROP TABLE IF EXISTS sandbox_agent_run_events`.execute(db);
    await sql`DROP TABLE IF EXISTS sandbox_agent_runs`.execute(db);
    await sql`DROP TABLE IF EXISTS sandbox_agent_runtimes`.execute(db);
  },
};
