import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const previewPolicyDecisionsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS preview_policy_decisions (
        source_event_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
        resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        event_kind TEXT NOT NULL,
        event_action TEXT NOT NULL,
        repository_full_name TEXT NOT NULL,
        head_repository_full_name TEXT NOT NULL,
        pull_request_number INTEGER NOT NULL,
        head_sha TEXT NOT NULL,
        base_ref TEXT NOT NULL,
        fork BOOLEAN NOT NULL,
        secret_backed BOOLEAN NOT NULL,
        requested_secret_scope_count INTEGER NOT NULL,
        status TEXT NOT NULL,
        phase TEXT NOT NULL,
        deployment_eligible BOOLEAN NOT NULL,
        reason_code TEXT,
        preview_environment_id TEXT,
        deployment_id TEXT,
        evaluated_at TIMESTAMPTZ NOT NULL
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS preview_policy_decisions_resource_evaluated_idx
      ON preview_policy_decisions (resource_id, evaluated_at DESC)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS preview_policy_decisions_status_idx
      ON preview_policy_decisions (status)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP INDEX IF EXISTS preview_policy_decisions_status_idx
    `.execute(db);

    await sql`
      DROP INDEX IF EXISTS preview_policy_decisions_resource_evaluated_idx
    `.execute(db);

    await sql`
      DROP TABLE IF EXISTS preview_policy_decisions
    `.execute(db);
  },
};
