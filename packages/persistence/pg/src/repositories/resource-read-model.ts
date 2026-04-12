import {
  createReadModelSpanName,
  type RepositoryContext,
  type ResourceReadModel,
  type ResourceSummary,
  yunduTraceAttributes,
} from "@yundu/application";
import { type Kysely } from "kysely";

import { type Database } from "../schema";
import {
  normalizeTimestamp,
  resolveRepositoryExecutor,
  type SerializedResourceService,
} from "./shared";

type ResourceSummaryItem = Awaited<ReturnType<ResourceReadModel["list"]>>[number];

export class PgResourceReadModel implements ResourceReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async list(
    context: RepositoryContext,
    input?: {
      projectId?: string;
      environmentId?: string;
    },
  ) {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("resource", "list"),
      {
        attributes: {
          [yunduTraceAttributes.readModelName]: "resource",
        },
      },
      async () => {
        let query = executor.selectFrom("resources").selectAll().orderBy("created_at", "desc");

        if (input?.projectId) {
          query = query.where("project_id", "=", input.projectId);
        }

        if (input?.environmentId) {
          query = query.where("environment_id", "=", input.environmentId);
        }

        const rows = await query.execute();
        const deploymentRows =
          rows.length > 0
            ? await executor
                .selectFrom("deployments")
                .select(["id", "resource_id", "status", "created_at"])
                .where(
                  "resource_id",
                  "in",
                  rows.map((row) => row.id),
                )
                .orderBy("created_at", "desc")
                .execute()
            : [];

        return rows.map((row): ResourceSummary => {
          const services = (row.services ?? []) as unknown as SerializedResourceService[];
          const deployments = deploymentRows.filter(
            (deployment) => deployment.resource_id === row.id,
          );
          const lastDeployment = deployments[0];

          return {
            id: row.id,
            projectId: row.project_id,
            environmentId: row.environment_id,
            ...(row.destination_id ? { destinationId: row.destination_id } : {}),
            name: row.name,
            slug: row.slug,
            kind: row.kind as ResourceSummaryItem["kind"],
            ...(row.description ? { description: row.description } : {}),
            services: services.map((service) => ({
              name: service.name,
              kind: service.kind,
            })),
            deploymentCount: deployments.length,
            ...(lastDeployment
              ? {
                  lastDeploymentId: lastDeployment.id,
                  lastDeploymentStatus: lastDeployment.status as NonNullable<
                    ResourceSummaryItem["lastDeploymentStatus"]
                  >,
                }
              : {}),
            createdAt: normalizeTimestamp(row.created_at) ?? row.created_at,
          };
        });
      },
    );
  }
}
