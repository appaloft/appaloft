import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const serverOrganizationOwnershipMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      alter table servers
      add column if not exists organization_id text not null default 'org_self_hosted'
    `.execute(db);

    await sql`
      create index if not exists servers_organization_id_idx
      on servers (organization_id)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`drop index if exists servers_organization_id_idx`.execute(db);
    await sql`alter table servers drop column if exists organization_id`.execute(db);
  },
};
