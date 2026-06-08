import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE deployments
    ADD COLUMN IF NOT EXISTS target_kind text NOT NULL DEFAULT 'server-backed',
    ADD COLUMN IF NOT EXISTS static_artifact_publication_id text,
    ADD COLUMN IF NOT EXISTS static_artifact_id text,
    ADD COLUMN IF NOT EXISTS static_artifact_route_url text
  `.execute(db);

  await sql`
    ALTER TABLE deployments
    ALTER COLUMN server_id DROP NOT NULL,
    ALTER COLUMN destination_id DROP NOT NULL
  `.execute(db);

  await sql`
    ALTER TABLE deployments
    DROP CONSTRAINT IF EXISTS deployments_target_variant_check
  `.execute(db);

  await sql`
    ALTER TABLE deployments
    ADD CONSTRAINT deployments_target_variant_check
    CHECK (
      (
        target_kind = 'server-backed'
        AND server_id IS NOT NULL
        AND destination_id IS NOT NULL
        AND static_artifact_publication_id IS NULL
        AND static_artifact_id IS NULL
        AND static_artifact_route_url IS NULL
      )
      OR
      (
        target_kind = 'serverless-static-artifact'
        AND server_id IS NULL
        AND destination_id IS NULL
        AND static_artifact_publication_id IS NOT NULL
        AND static_artifact_id IS NOT NULL
        AND static_artifact_route_url IS NOT NULL
      )
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE deployments
    DROP CONSTRAINT IF EXISTS deployments_target_variant_check
  `.execute(db);

  await sql`
    DELETE FROM deployments
    WHERE target_kind = 'serverless-static-artifact'
  `.execute(db);

  await sql`
    ALTER TABLE deployments
    ALTER COLUMN server_id SET NOT NULL,
    ALTER COLUMN destination_id SET NOT NULL
  `.execute(db);

  await sql`
    ALTER TABLE deployments
    DROP COLUMN IF EXISTS static_artifact_route_url,
    DROP COLUMN IF EXISTS static_artifact_id,
    DROP COLUMN IF EXISTS static_artifact_publication_id,
    DROP COLUMN IF EXISTS target_kind
  `.execute(db);
}
