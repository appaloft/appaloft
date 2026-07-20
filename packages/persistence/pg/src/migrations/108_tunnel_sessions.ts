import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const tunnelSessionsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS tunnel_sessions (
        id TEXT PRIMARY KEY,
        organization_id TEXT,
        provider_key TEXT NOT NULL,
        origin_url TEXT NOT NULL,
        public_url TEXT,
        status TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        failure_code TEXT,
        provider_handle JSONB,
        CONSTRAINT tunnel_sessions_provider_chk CHECK (provider_key IN ('cloudflare-quick', 'ngrok')),
        CONSTRAINT tunnel_sessions_status_chk CHECK (status IN ('starting', 'ready', 'failed', 'revoked', 'expired'))
      )
    `.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS tunnel_sessions_owner_created_idx ON tunnel_sessions (organization_id, created_at DESC)`.execute(
      db,
    );
    await sql`CREATE INDEX IF NOT EXISTS tunnel_sessions_reconcile_idx ON tunnel_sessions (status, expires_at)`.execute(
      db,
    );
  },
  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP TABLE IF EXISTS tunnel_sessions`.execute(db);
  },
};
