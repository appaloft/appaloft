import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  createRepositorySpanName,
  type EnvironmentProfileDecisionReadModel,
  type EnvironmentProfileDecisionRepository,
  type EnvironmentProfilePendingDecisionSummary,
  type RepositoryContext,
} from "@appaloft/application";
import { type Insertable, type Kysely, type Selectable } from "kysely";

import { type Database } from "../schema";
import {
  normalizeTimestamp,
  resolveRepositoryContextOrganizationId,
  resolveRepositoryExecutor,
  withRepositoryTransaction,
} from "./shared";

type EnvironmentProfileDecisionRow = Selectable<Database["environment_profile_decisions"]>;

function toSummary(row: EnvironmentProfileDecisionRow): EnvironmentProfilePendingDecisionSummary {
  return {
    id: row.id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    ...(row.resource_id ? { resourceId: row.resource_id } : {}),
    kind: row.kind as EnvironmentProfilePendingDecisionSummary["kind"],
    sourceId: row.source_id,
    ...(row.source_environment_id ? { sourceEnvironmentId: row.source_environment_id } : {}),
    ...(row.source_resource_id ? { sourceResourceId: row.source_resource_id } : {}),
    ...(row.decision ? { decision: row.decision } : {}),
    reason: row.reason,
    status: row.status as EnvironmentProfilePendingDecisionSummary["status"],
    createdAt: normalizeTimestamp(row.created_at) ?? row.created_at,
    ...(row.resolved_at
      ? { resolvedAt: normalizeTimestamp(row.resolved_at) ?? row.resolved_at }
      : {}),
  };
}

export class PgEnvironmentProfileDecisionRepository
  implements EnvironmentProfileDecisionRepository, EnvironmentProfileDecisionReadModel
{
  constructor(private readonly db: Kysely<Database>) {}

  async recordPending(
    context: RepositoryContext,
    input: Parameters<EnvironmentProfileDecisionRepository["recordPending"]>[1],
  ): Promise<void> {
    const row: Insertable<Database["environment_profile_decisions"]> = {
      id: input.id,
      project_id: input.projectId,
      environment_id: input.environmentId,
      resource_id: input.resourceId ?? null,
      kind: input.kind,
      source_id: input.sourceId,
      source_environment_id: input.sourceEnvironmentId ?? null,
      source_resource_id: input.sourceResourceId ?? null,
      decision: input.decision ?? null,
      reason: input.reason,
      status: "pending",
      created_at: input.createdAt,
      resolved_at: null,
    };

    await context.tracer.startActiveSpan(
      createRepositorySpanName("environment-profile-decision", "record_pending"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "environment-profile-decision",
        },
      },
      async () => {
        await withRepositoryTransaction(this.db, context, async (transaction) => {
          await transaction
            .insertInto("environment_profile_decisions")
            .values(row)
            .onConflict((conflict) =>
              conflict.column("id").doUpdateSet({
                reason: row.reason,
                decision: row.decision,
                status: "pending",
                resolved_at: null,
              }),
            )
            .execute();
        });
      },
    );
  }

  async listPending(
    context: RepositoryContext,
    input: Parameters<EnvironmentProfileDecisionReadModel["listPending"]>[1],
  ): Promise<EnvironmentProfilePendingDecisionSummary[]> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("environment-profile-decision", "list_pending"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "environment-profile-decision",
        },
      },
      async () => {
        let query = executor
          .selectFrom("environment_profile_decisions")
          .selectAll()
          .where("environment_id", "=", input.environmentId)
          .where("status", "=", "pending");

        query = input.resourceId
          ? query.where("resource_id", "=", input.resourceId)
          : query.where("resource_id", "is", null);

        const organizationId = resolveRepositoryContextOrganizationId(context);
        if (organizationId) {
          query = query.where(
            "project_id",
            "in",
            executor
              .selectFrom("projects")
              .select("id")
              .where("organization_id", "=", organizationId),
          );
        }

        const rows = await query.orderBy("created_at", "asc").execute();
        return rows.map((row) => toSummary(row));
      },
    );
  }
}
