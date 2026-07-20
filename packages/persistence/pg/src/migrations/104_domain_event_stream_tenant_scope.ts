import { type Kysely, sql } from "kysely";

export const domainEventStreamTenantScopeMigration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await sql`
      ALTER TABLE domain_event_stream_records
      ADD COLUMN IF NOT EXISTS tenant_id TEXT
    `.execute(db);
    await sql`
      CREATE INDEX IF NOT EXISTS domain_event_stream_records_tenant_stream_idx
      ON domain_event_stream_records (tenant_id, stream_scope, stream_id, occurred_at, id)
    `.execute(db);
  },
  async down(db: Kysely<unknown>): Promise<void> {
    await sql`DROP INDEX IF EXISTS domain_event_stream_records_tenant_stream_idx`.execute(db);
    await sql`ALTER TABLE domain_event_stream_records DROP COLUMN IF EXISTS tenant_id`.execute(db);
  },
};
