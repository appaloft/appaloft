import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const githubAppInstallationsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS github_app_installations (
        tenant_id text NOT NULL,
        provider_key text NOT NULL,
        installation_id text NOT NULL,
        account_id text,
        account_login text,
        account_type text,
        repositories_selection text,
        repository_count integer,
        suspended_at text,
        installed_at text NOT NULL,
        updated_at text NOT NULL,
        PRIMARY KEY (tenant_id, provider_key)
      )
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS github_app_installations_installation_unique
      ON github_app_installations (provider_key, installation_id)
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      DROP INDEX IF EXISTS github_app_installations_installation_unique
    `.execute(db);

    await sql`
      DROP TABLE IF EXISTS github_app_installations
    `.execute(db);
  },
};
