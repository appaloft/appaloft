import { type Kysely, sql } from "kysely";
import { type Database } from "../schema";

export const githubAgentThreadFeedbackMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`ALTER TABLE github_agent_thread_tasks
      ADD COLUMN IF NOT EXISTS feedback_state JSONB`.execute(db);
  },
  async down(db: Kysely<Database>): Promise<void> {
    await sql`ALTER TABLE github_agent_thread_tasks
      DROP COLUMN IF EXISTS feedback_state`.execute(db);
  },
};
