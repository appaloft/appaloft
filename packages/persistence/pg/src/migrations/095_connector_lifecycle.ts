import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const connectorLifecycleMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS connector_connections (
        id TEXT PRIMARY KEY,
        owner_scope TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        owner_tenant_id TEXT,
        connector_key TEXT NOT NULL,
        category TEXT NOT NULL,
        status TEXT NOT NULL,
        snapshot JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS connector_connections_owner_idx
      ON connector_connections (owner_scope, owner_id, owner_tenant_id, connector_key)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS connector_connections_connector_status_idx
      ON connector_connections (connector_key, status)
    `.execute(db);

    await sql`
      CREATE TABLE IF NOT EXISTS connector_authorization_attempts (
        id TEXT PRIMARY KEY,
        state TEXT NOT NULL UNIQUE,
        connection_id TEXT NOT NULL,
        connector_key TEXT NOT NULL,
        owner_scope TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        owner_tenant_id TEXT,
        status TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        snapshot JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS connector_authorization_attempts_connection_idx
      ON connector_authorization_attempts (connection_id, connector_key)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS connector_authorization_attempts_owner_idx
      ON connector_authorization_attempts (owner_scope, owner_id, owner_tenant_id, connector_key)
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS connector_authorization_attempts_expiry_idx
      ON connector_authorization_attempts (expires_at, status)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`DROP TABLE IF EXISTS connector_authorization_attempts`.execute(db);
    await sql`DROP TABLE IF EXISTS connector_connections`.execute(db);
  },
};
