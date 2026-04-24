import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  type RepositoryContext,
  type SshCredentialReadModel,
  type SshCredentialUsageReader,
  type SshCredentialUsageServerSummary,
} from "@appaloft/application";
import {
  type SshCredentialByIdSpec,
  type SshCredentialSelectionSpecVisitor,
  type UnusedSshCredentialByIdSpec,
} from "@appaloft/core";
import { type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database } from "../schema";
import { normalizeTimestamp, resolveRepositoryExecutor } from "./shared";

type SshCredentialSelectionQuery = SelectQueryBuilder<
  Database,
  "ssh_credentials",
  Selectable<Database["ssh_credentials"]>
>;

class KyselySshCredentialReadModelSelectionVisitor
  implements SshCredentialSelectionSpecVisitor<SshCredentialSelectionQuery>
{
  visitSshCredentialById(
    query: SshCredentialSelectionQuery,
    spec: SshCredentialByIdSpec,
  ): SshCredentialSelectionQuery {
    return query.where("id", "=", spec.id.value);
  }

  visitUnusedSshCredentialById(
    query: SshCredentialSelectionQuery,
    spec: UnusedSshCredentialByIdSpec,
  ): SshCredentialSelectionQuery {
    return query
      .where("id", "=", spec.id.value)
      .where(({ exists, not, selectFrom }) =>
        not(
          exists(
            selectFrom("servers")
              .select("servers.id")
              .whereRef("servers.credential_id", "=", "ssh_credentials.id")
              .where("servers.lifecycle_status", "in", ["active", "inactive"]),
          ),
        ),
      );
  }
}

function toSshCredentialSummary(
  row: Selectable<Database["ssh_credentials"]>,
): Awaited<ReturnType<SshCredentialReadModel["list"]>>[number] {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as "ssh-private-key",
    ...(row.username ? { username: row.username } : {}),
    publicKeyConfigured: Boolean(row.public_key),
    privateKeyConfigured: Boolean(row.private_key),
    createdAt: normalizeTimestamp(row.created_at) ?? row.created_at,
  };
}

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
          .then((rows) => rows.map(toSshCredentialSummary)),
    );
  }

  async findOne(
    context: RepositoryContext,
    spec: Parameters<SshCredentialReadModel["findOne"]>[1],
  ) {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("ssh_credential", "find_one"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "ssh_credential",
          [appaloftTraceAttributes.selectionSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const row = await spec
          .accept(
            executor.selectFrom("ssh_credentials").selectAll(),
            new KyselySshCredentialReadModelSelectionVisitor(),
          )
          .executeTakeFirst();

        return row ? toSshCredentialSummary(row) : null;
      },
    );
  }
}

export class PgSshCredentialUsageReader implements SshCredentialUsageReader {
  constructor(private readonly db: Kysely<Database>) {}

  async listByCredentialId(
    context: RepositoryContext,
    credentialId: string,
  ): Promise<SshCredentialUsageServerSummary[]> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("ssh_credential_usage", "list_by_credential_id"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "ssh_credential_usage",
        },
      },
      async () => {
        const rows = await executor
          .selectFrom("servers")
          .leftJoin("ssh_credentials", "ssh_credentials.id", "servers.credential_id")
          .select([
            "servers.id as serverId",
            "servers.name as serverName",
            "servers.lifecycle_status as lifecycleStatus",
            "servers.provider_key as providerKey",
            "servers.host as host",
            "servers.credential_username as credentialUsername",
            "ssh_credentials.username as credentialDefaultUsername",
          ])
          .where("servers.credential_id", "=", credentialId)
          .where("servers.lifecycle_status", "in", ["active", "inactive"])
          .orderBy("servers.created_at", "desc")
          .execute();

        return rows.map((row) => {
          const username = row.credentialUsername ?? row.credentialDefaultUsername ?? undefined;

          return {
            serverId: row.serverId,
            serverName: row.serverName,
            lifecycleStatus: row.lifecycleStatus as "active" | "inactive",
            providerKey: row.providerKey,
            host: row.host,
            ...(username ? { username } : {}),
          };
        });
      },
    );
  }
}
