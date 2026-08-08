import { type Kysely, sql } from "kysely";
import { type Database } from "../schema";

export const agentWorkspaceProfileMcpConnectionsMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`ALTER TABLE agent_workspace_profile_installations
      ADD COLUMN IF NOT EXISTS mcp_connections JSONB NOT NULL DEFAULT '[]'::jsonb`.execute(db);
  },
  async down(db: Kysely<Database>): Promise<void> {
    await sql`ALTER TABLE agent_workspace_profile_installations
      DROP COLUMN IF EXISTS mcp_connections`.execute(db);
  },
};
