import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const mutationCoordinationsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS mutation_coordinations (
        coordination_scope_kind text NOT NULL,
        coordination_scope_key text NOT NULL,
        operation_key text NOT NULL,
        coordination_mode text NOT NULL,
        owner_id text NOT NULL,
        owner_label text NOT NULL,
        acquired_at timestamptz NOT NULL,
        heartbeat_at timestamptz NOT NULL,
        lease_expires_at timestamptz NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        PRIMARY KEY (coordination_scope_kind, coordination_scope_key)
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS mutation_coordinations_lease_expires_at_idx
      ON mutation_coordinations (lease_expires_at)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP INDEX IF EXISTS mutation_coordinations_lease_expires_at_idx
    `.execute(db);

    await sql`
      DROP TABLE IF EXISTS mutation_coordinations
    `.execute(db);
  },
};
