import { type Kysely, sql } from "kysely";

export const resourceAutoDeployPolicyMigration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await sql`
      ALTER TABLE resources
      ADD COLUMN IF NOT EXISTS auto_deploy_policy jsonb
    `.execute(db);
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await sql`
      ALTER TABLE resources
      DROP COLUMN IF EXISTS auto_deploy_policy
    `.execute(db);
  },
};
