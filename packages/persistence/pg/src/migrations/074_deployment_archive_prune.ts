import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE deployments
    ADD COLUMN IF NOT EXISTS archived_at timestamptz
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS deployments_archived_at_idx
    ON deployments (archived_at, created_at DESC)
    WHERE archived_at IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS deployments_archived_at_idx`.execute(db);
  await sql`
    ALTER TABLE deployments
    DROP COLUMN IF EXISTS archived_at
  `.execute(db);
}

export const deploymentArchivePruneMigration = { up, down };
