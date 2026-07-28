import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const serverWorkloadRolesMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE servers
      ADD COLUMN IF NOT EXISTS workload_roles jsonb NOT NULL DEFAULT '[]'::jsonb
    `.execute(db);

    await sql`
      ALTER TABLE servers
      ADD CONSTRAINT servers_workload_roles_canonical_check
      CHECK (
        workload_roles IN (
          '[]'::jsonb,
          '["deployment-runtime"]'::jsonb,
          '["artifact-builder"]'::jsonb,
          '["sandbox-worker"]'::jsonb,
          '["deployment-runtime", "artifact-builder"]'::jsonb,
          '["deployment-runtime", "sandbox-worker"]'::jsonb,
          '["artifact-builder", "sandbox-worker"]'::jsonb,
          '["deployment-runtime", "artifact-builder", "sandbox-worker"]'::jsonb
        )
      )
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE servers
      DROP COLUMN IF EXISTS workload_roles
    `.execute(db);
  },
};
