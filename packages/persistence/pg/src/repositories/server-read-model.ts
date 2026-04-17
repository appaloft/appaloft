import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  type RepositoryContext,
  type ServerReadModel,
} from "@appaloft/application";
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
          [appaloftTraceAttributes.readModelName]: "server",
        },
      },
      async () =>
        executor
          .selectFrom("servers")
          .leftJoin("ssh_credentials", "ssh_credentials.id", "servers.credential_id")
          .selectAll("servers")
          .select("ssh_credentials.name as credential_name")
          .orderBy("created_at", "desc")
          .execute()
          .then((rows) =>
            rows.map((row) => ({
              id: row.id,
              name: row.name,
              host: row.host,
              port: row.port,
              providerKey: row.provider_key,
              ...(row.edge_proxy_kind && row.edge_proxy_status
                ? {
                    edgeProxy: {
                      kind: row.edge_proxy_kind as "none" | "traefik" | "caddy",
                      status: row.edge_proxy_status as
                        | "pending"
                        | "starting"
                        | "ready"
                        | "failed"
                        | "disabled",
                      ...(row.edge_proxy_last_attempt_at
                        ? {
                            lastAttemptAt:
                              normalizeTimestamp(row.edge_proxy_last_attempt_at) ??
                              row.edge_proxy_last_attempt_at,
                          }
                        : {}),
                      ...(row.edge_proxy_last_succeeded_at
                        ? {
                            lastSucceededAt:
                              normalizeTimestamp(row.edge_proxy_last_succeeded_at) ??
                              row.edge_proxy_last_succeeded_at,
                          }
                        : {}),
                      ...(row.edge_proxy_last_error_code
                        ? { lastErrorCode: row.edge_proxy_last_error_code }
                        : {}),
                      ...(row.edge_proxy_last_error_message
                        ? { lastErrorMessage: row.edge_proxy_last_error_message }
                        : {}),
                    },
                  }
                : {}),
              ...(row.credential_kind
                ? {
                    credential: {
                      kind: row.credential_kind as "local-ssh-agent" | "ssh-private-key",
                      ...(row.credential_id ? { credentialId: row.credential_id } : {}),
                      ...(row.credential_name ? { credentialName: row.credential_name } : {}),
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
