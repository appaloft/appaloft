import {
  createReadModelSpanName,
  type RepositoryContext,
  type ServerReadModel,
  yunduTraceAttributes,
} from "@yundu/application";
import { type Kysely } from "kysely";

import { type Database } from "../schema";
import { normalizeTimestamp, resolveRepositoryExecutor } from "./shared";

export class PgServerReadModel implements ServerReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async list(context: RepositoryContext) {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("server", "list"),
      {
        attributes: {
          [yunduTraceAttributes.readModelName]: "server",
        },
      },
      async () =>
        executor
          .selectFrom("servers")
          .selectAll()
          .orderBy("created_at", "desc")
          .execute()
          .then((rows) =>
            rows.map((row) => ({
              id: row.id,
              name: row.name,
              host: row.host,
              port: row.port,
              providerKey: row.provider_key,
              ...(row.credential_kind
                ? {
                    credential: {
                      kind: row.credential_kind as "local-ssh-agent" | "ssh-private-key",
                      ...(row.credential_username ? { username: row.credential_username } : {}),
                      publicKeyConfigured: Boolean(row.credential_public_key),
                      privateKeyConfigured: Boolean(row.credential_private_key),
                    },
                  }
                : {}),
              createdAt: normalizeTimestamp(row.created_at) ?? row.created_at,
            })),
          ),
    );
  }
}
