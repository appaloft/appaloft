import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const resourceAccessFailureEvidenceMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS resource_access_failure_evidence (
        request_id TEXT PRIMARY KEY,
        diagnostic JSONB NOT NULL,
        resource_id TEXT,
        deployment_id TEXT,
        domain_binding_id TEXT,
        server_id TEXT,
        destination_id TEXT,
        route_id TEXT,
        hostname TEXT,
        path TEXT,
        captured_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS resource_access_failure_evidence_expires_at_idx
      ON resource_access_failure_evidence (expires_at)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS resource_access_failure_evidence_resource_id_idx
      ON resource_access_failure_evidence (resource_id)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS resource_access_failure_evidence_hostname_path_idx
      ON resource_access_failure_evidence (hostname, path)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP TABLE IF EXISTS resource_access_failure_evidence
    `.execute(db);
  },
};
