import { type Kysely, sql } from "kysely";
import { type Database } from "../schema";

export const controlPlanePortabilityArtifactsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS control_plane_portability_artifacts (
        id TEXT PRIMARY KEY,
        schema_version TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        source_revision TEXT NOT NULL,
        table_count INTEGER NOT NULL,
        row_count INTEGER NOT NULL,
        checksum TEXT NOT NULL,
        size_bytes BIGINT NOT NULL,
        kind TEXT NOT NULL,
        encrypted_envelope TEXT NOT NULL,
        CONSTRAINT control_plane_portability_artifacts_kind_chk CHECK (kind IN ('export', 'rollback', 'imported'))
      )
    `.execute(db);
  },
  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP TABLE IF EXISTS control_plane_portability_artifacts`.execute(db);
  },
};
