import { HostAddress } from "@appaloft/core";
import { type Kysely } from "kysely";

import { type Database } from "../schema";

export const serverHostIdentityMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    const rows = await db.selectFrom("servers").select(["id", "host"]).execute();
    for (const row of rows) {
      const host = HostAddress.create(row.host);
      if (host.isOk() && host.value.value !== row.host) {
        await db
          .updateTable("servers")
          .set({ host: host.value.value })
          .where("id", "=", row.id)
          .execute();
      }
    }
  },

  async down(): Promise<void> {
    // Canonical spelling is semantically equivalent and the previous text spelling is not retained.
  },
};
