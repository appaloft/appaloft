import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  type RepositoryContext,
  type SshCredentialReadModel,
} from "@appaloft/application";
import { type Kysely } from "kysely";

import { type Database } from "../schema";
import { normalizeTimestamp, resolveRepositoryExecutor } from "./shared";

export class PgSshCredentialReadModel implements SshCredentialReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async list(context: RepositoryContext) {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("ssh_credential", "list"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "ssh_credential",
        },
      },
      async () =>
        executor
          .selectFrom("ssh_credentials")
          .selectAll()
          .orderBy("created_at", "desc")
          .execute()
          .then((rows) =>
            rows.map((row) => ({
              id: row.id,
              name: row.name,
              kind: row.kind as "ssh-private-key",
              ...(row.username ? { username: row.username } : {}),
              publicKeyConfigured: Boolean(row.public_key),
              privateKeyConfigured: Boolean(row.private_key),
              createdAt: normalizeTimestamp(row.created_at) ?? row.created_at,
            })),
          ),
    );
  }
}
