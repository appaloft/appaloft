import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  type RepositoryContext,
  type ServerReadModel,
} from "@appaloft/application";
import {
  type DeploymentTargetByIdSpec,
  type DeploymentTargetByProviderAndHostSpec,
  type DeploymentTargetSelectionSpecVisitor,
} from "@appaloft/core";
import { type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database } from "../schema";
import { normalizeTimestamp, resolveRepositoryExecutor } from "./shared";

type ServerSelectionQuery = SelectQueryBuilder<
  Database,
  "servers",
  Selectable<Database["servers"]>
>;

type ServerSummaryRow = Selectable<Database["servers"]> & {
  credential_name?: string | null;
};

class KyselyServerSelectionVisitor
  implements DeploymentTargetSelectionSpecVisitor<ServerSelectionQuery>
{
  visitDeploymentTargetById(
    query: ServerSelectionQuery,
    spec: DeploymentTargetByIdSpec,
  ): ServerSelectionQuery {
    return query.where("id", "=", spec.id.value);
  }

  visitDeploymentTargetByProviderAndHost(
    query: ServerSelectionQuery,
    spec: DeploymentTargetByProviderAndHostSpec,
  ): ServerSelectionQuery {
    return query
      .where("provider_key", "=", spec.providerKey.value)
      .where("host", "=", spec.host.value);
  }
}

function toServerSummary(
  row: ServerSummaryRow,
): Awaited<ReturnType<ServerReadModel["list"]>>[number] {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    providerKey: row.provider_key,
    targetKind: row.target_kind as "single-server" | "orchestrator-cluster",
    lifecycleStatus: row.lifecycle_status as "active" | "inactive",
    ...(row.deactivated_at
      ? { deactivatedAt: normalizeTimestamp(row.deactivated_at) ?? row.deactivated_at }
      : {}),
    ...(row.deactivation_reason ? { deactivationReason: row.deactivation_reason } : {}),
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
  };
}

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
          .where("servers.lifecycle_status", "!=", "deleted")
          .orderBy("created_at", "desc")
          .execute()
          .then((rows) => rows.map(toServerSummary)),
    );
  }

  async findOne(context: RepositoryContext, spec: Parameters<ServerReadModel["findOne"]>[1]) {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("server", "find_one"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "server",
          [appaloftTraceAttributes.selectionSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const row = await spec
          .accept(executor.selectFrom("servers").selectAll(), new KyselyServerSelectionVisitor())
          .where("lifecycle_status", "!=", "deleted")
          .executeTakeFirst();

        if (!row) {
          return null;
        }

        const credential = row.credential_id
          ? await executor
              .selectFrom("ssh_credentials")
              .select(["name"])
              .where("id", "=", row.credential_id)
              .executeTakeFirst()
          : null;

        return toServerSummary({
          ...row,
          credential_name: credential?.name ?? null,
        });
      },
    );
  }
}
