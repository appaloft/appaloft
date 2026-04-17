import {
  appaloftTraceAttributes,
  createRepositorySpanName,
  type DomainRouteBindingCandidate,
  type DomainRouteBindingReader,
  type RepositoryContext,
} from "@appaloft/application";
import { type Kysely } from "kysely";

import { type Database } from "../schema";
import { normalizeTimestamp, resolveRepositoryExecutor } from "./shared";

const deployableDomainBindingStatuses = ["bound", "certificate_pending", "ready", "not_ready"];

export class PgDomainRouteBindingReader implements DomainRouteBindingReader {
  constructor(private readonly db: Kysely<Database>) {}

  async listDeployableBindings(
    context: RepositoryContext,
    input: {
      projectId: string;
      environmentId: string;
      resourceId: string;
      serverId: string;
      destinationId: string;
    },
  ): Promise<DomainRouteBindingCandidate[]> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("domain_route_binding", "list_deployable_bindings"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "domain_route_binding",
        },
      },
      async () => {
        const rows = await executor
          .selectFrom("domain_bindings")
          .select([
            "id",
            "domain_name",
            "path_prefix",
            "proxy_kind",
            "tls_mode",
            "status",
            "created_at",
          ])
          .where("project_id", "=", input.projectId)
          .where("environment_id", "=", input.environmentId)
          .where("resource_id", "=", input.resourceId)
          .where("server_id", "=", input.serverId)
          .where("destination_id", "=", input.destinationId)
          .where("status", "in", deployableDomainBindingStatuses)
          .orderBy("created_at", "desc")
          .execute();

        return rows.map((row) => ({
          id: row.id,
          domainName: row.domain_name,
          pathPrefix: row.path_prefix,
          proxyKind: row.proxy_kind as DomainRouteBindingCandidate["proxyKind"],
          tlsMode: row.tls_mode as DomainRouteBindingCandidate["tlsMode"],
          status: row.status as DomainRouteBindingCandidate["status"],
          createdAt: normalizeTimestamp(row.created_at) ?? row.created_at,
        }));
      },
    );
  }
}
