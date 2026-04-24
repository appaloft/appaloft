import {
  appaloftTraceAttributes,
  createRepositorySpanName,
  type RepositoryContext,
  type ServerDeletionBlocker,
  type ServerDeletionBlockerKind,
  type ServerDeletionBlockerReader,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Kysely } from "kysely";

import { type Database } from "../schema";
import { resolveRepositoryExecutor } from "./shared";

function blockerFromRows(
  kind: ServerDeletionBlockerKind,
  relatedEntityType: string,
  rows: Array<{ id: string }>,
): ServerDeletionBlocker | null {
  if (rows.length === 0) {
    return null;
  }

  return {
    kind,
    relatedEntityType,
    ...(rows[0] ? { relatedEntityId: rows[0].id } : {}),
    count: rows.length,
  };
}

export class PgServerDeletionBlockerReader implements ServerDeletionBlockerReader {
  constructor(private readonly db: Kysely<Database>) {}

  async findBlockers(
    context: RepositoryContext,
    input: { serverId: string },
  ): Promise<Result<ServerDeletionBlocker[]>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("server_deletion_blocker", "find_blockers"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "server_deletion_blocker",
        },
      },
      async () => {
        try {
          const deploymentRows = await executor
            .selectFrom("deployments")
            .select("id")
            .where("server_id", "=", input.serverId)
            .execute();
          const activeDeploymentRows = await executor
            .selectFrom("deployments")
            .select("id")
            .where("server_id", "=", input.serverId)
            .where("status", "in", [
              "created",
              "planning",
              "planned",
              "running",
              "cancel-requested",
            ])
            .execute();
          const resourceRows = await executor
            .selectFrom("resources")
            .innerJoin("destinations", "destinations.id", "resources.destination_id")
            .select("resources.id as id")
            .where("destinations.server_id", "=", input.serverId)
            .where("resources.lifecycle_status", "!=", "deleted")
            .execute();
          const domainBindingRows = await executor
            .selectFrom("domain_bindings")
            .select("id")
            .where("server_id", "=", input.serverId)
            .execute();
          const certificateRows = await executor
            .selectFrom("certificates")
            .innerJoin("domain_bindings", "domain_bindings.id", "certificates.domain_binding_id")
            .select("certificates.id as id")
            .where("domain_bindings.server_id", "=", input.serverId)
            .execute();
          const credentialRows = await executor
            .selectFrom("servers")
            .select("credential_id as id")
            .where("id", "=", input.serverId)
            .where("credential_id", "is not", null)
            .execute();
          const serverAppliedRouteRows = await executor
            .selectFrom("server_applied_route_states")
            .select("route_set_id as id")
            .where("server_id", "=", input.serverId)
            .execute();
          const sourceLinkRows = await executor
            .selectFrom("source_links")
            .select("source_fingerprint as id")
            .where("server_id", "=", input.serverId)
            .execute();
          const defaultAccessPolicyRows = await executor
            .selectFrom("default_access_domain_policies")
            .select("scope_key as id")
            .where("scope_kind", "=", "deployment-target")
            .where("server_id", "=", input.serverId)
            .execute();
          const runtimeLogRows = await executor
            .selectFrom("provider_job_logs")
            .innerJoin("deployments", "deployments.id", "provider_job_logs.deployment_id")
            .select("provider_job_logs.id as id")
            .where("deployments.server_id", "=", input.serverId)
            .execute();
          const auditRows = await executor
            .selectFrom("audit_logs")
            .select("id")
            .where("aggregate_id", "=", input.serverId)
            .execute();
          const credentialBlockerRows = credentialRows.flatMap((row) =>
            row.id ? [{ id: row.id }] : [],
          );

          const blockers = [
            blockerFromRows("deployment-history", "deployment", deploymentRows),
            blockerFromRows("active-deployment", "deployment", activeDeploymentRows),
            blockerFromRows("resource-placement", "resource", resourceRows),
            blockerFromRows("domain-binding", "domain-binding", domainBindingRows),
            blockerFromRows("certificate", "certificate", certificateRows),
            blockerFromRows("credential", "credential", credentialBlockerRows),
            blockerFromRows("server-applied-route", "server-applied-route", serverAppliedRouteRows),
            blockerFromRows("source-link", "source-link", sourceLinkRows),
            blockerFromRows(
              "default-access-policy",
              "default-access-policy",
              defaultAccessPolicyRows,
            ),
            blockerFromRows("runtime-log-retention", "runtime-log", runtimeLogRows),
            blockerFromRows("audit-retention", "audit-log", auditRows),
          ].filter((blocker): blocker is ServerDeletionBlocker => blocker !== null);

          return ok(blockers);
        } catch (error) {
          return err(
            domainError.infra("Server deletion blockers could not be read", {
              phase: "server-delete-check-read",
              serverId: input.serverId,
              adapter: "persistence.pg",
              operation: "server-deletion-blocker.find",
              errorMessage: error instanceof Error ? error.message : String(error),
            }),
          );
        }
      },
    );
  }
}
