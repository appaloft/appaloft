import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const repositoryBindingPerProjectMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`ALTER TABLE project_repository_bindings
      DROP CONSTRAINT IF EXISTS project_repository_bindings_tenant_id_repository_identity_key`.execute(
      db,
    );
    await sql`ALTER TABLE project_repository_bindings
      ADD CONSTRAINT project_repository_bindings_tenant_identity_project_key
      UNIQUE (tenant_id, repository_identity, project_id)`.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`ALTER TABLE project_repository_bindings
      DROP CONSTRAINT IF EXISTS project_repository_bindings_tenant_identity_project_key`.execute(
      db,
    );
    await sql`ALTER TABLE project_repository_bindings
      ADD CONSTRAINT project_repository_bindings_tenant_id_repository_identity_key
      UNIQUE (tenant_id, repository_identity)`.execute(db);
  },
};
