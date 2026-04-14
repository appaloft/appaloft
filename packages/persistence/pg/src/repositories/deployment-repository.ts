import {
  createRepositorySpanName,
  type DeploymentRepository,
  type RepositoryContext,
  yunduTraceAttributes,
} from "@yundu/application";
import {
  Deployment,
  type DeploymentByIdSpec,
  type DeploymentMutationSpec,
  type DeploymentMutationSpecVisitor,
  type DeploymentSelectionSpec,
  type DeploymentSelectionSpecVisitor,
  type LatestDeploymentSpec,
  type UpsertDeploymentSpec,
} from "@yundu/core";
import { type Insertable, type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database } from "../schema";
import {
  rehydrateDeploymentRow,
  resolveRepositoryExecutor,
  serializeDeploymentLogs,
  serializeEnvironmentSnapshot,
  serializeRuntimePlan,
} from "./shared";

type DeploymentSelectionQuery = SelectQueryBuilder<
  Database,
  "deployments",
  Selectable<Database["deployments"]>
>;

class KyselyDeploymentSelectionVisitor
  implements DeploymentSelectionSpecVisitor<DeploymentSelectionQuery>
{
  visitDeploymentById(
    query: DeploymentSelectionQuery,
    spec: DeploymentByIdSpec,
  ): DeploymentSelectionQuery {
    return query.where("id", "=", spec.id.value);
  }

  visitLatestDeployment(
    query: DeploymentSelectionQuery,
    spec: LatestDeploymentSpec,
  ): DeploymentSelectionQuery {
    return query
      .where("resource_id", "=", spec.resourceId.value)
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(1);
  }
}

class KyselyDeploymentMutationVisitor
  implements
    DeploymentMutationSpecVisitor<{
      values: Insertable<Database["deployments"]>;
    }>
{
  visitUpsertDeployment(spec: UpsertDeploymentSpec) {
    return {
      values: {
        id: spec.state.id.value,
        project_id: spec.state.projectId.value,
        environment_id: spec.state.environmentId.value,
        resource_id: spec.state.resourceId.value,
        server_id: spec.state.serverId.value,
        destination_id: spec.state.destinationId.value,
        status: spec.state.status.value,
        runtime_plan: serializeRuntimePlan(spec.state.runtimePlan),
        environment_snapshot: serializeEnvironmentSnapshot(spec.state.environmentSnapshot),
        logs: serializeDeploymentLogs(spec.state.logs),
        created_at: spec.state.createdAt.value,
        started_at: spec.state.startedAt?.value ?? null,
        finished_at: spec.state.finishedAt?.value ?? null,
        rollback_of_deployment_id: spec.state.rollbackOfDeploymentId?.value ?? null,
      },
    };
  }
}

export class PgDeploymentRepository implements DeploymentRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async upsert(
    context: RepositoryContext,
    deployment: Deployment,
    spec: DeploymentMutationSpec,
  ): Promise<void> {
    void deployment;
    const executor = resolveRepositoryExecutor(this.db, context);
    const mutation = spec.accept(new KyselyDeploymentMutationVisitor());
    await context.tracer.startActiveSpan(
      createRepositorySpanName("deployment", "upsert"),
      {
        attributes: {
          [yunduTraceAttributes.repositoryName]: "deployment",
          [yunduTraceAttributes.mutationSpecName]: spec.constructor.name,
        },
      },
      async () => {
        await executor
          .insertInto("deployments")
          .values(mutation.values)
          .onConflict((conflict) =>
            conflict.column("id").doUpdateSet({
              resource_id: mutation.values.resource_id,
              server_id: mutation.values.server_id,
              destination_id: mutation.values.destination_id,
              status: mutation.values.status,
              runtime_plan: mutation.values.runtime_plan as unknown as Record<string, unknown>,
              environment_snapshot: mutation.values.environment_snapshot as unknown as Record<
                string,
                unknown
              >,
              logs: mutation.values.logs as unknown as Record<string, unknown>[],
              started_at: mutation.values.started_at ?? null,
              finished_at: mutation.values.finished_at ?? null,
              rollback_of_deployment_id: mutation.values.rollback_of_deployment_id ?? null,
            }),
          )
          .execute();
      },
    );
  }

  async findOne(
    context: RepositoryContext,
    spec: DeploymentSelectionSpec,
  ): Promise<Deployment | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("deployment", "find_one"),
      {
        attributes: {
          [yunduTraceAttributes.repositoryName]: "deployment",
          [yunduTraceAttributes.selectionSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const row = await spec
          .accept(
            executor.selectFrom("deployments").selectAll(),
            new KyselyDeploymentSelectionVisitor(),
          )
          .executeTakeFirst();

        if (!row) {
          return null;
        }

        return Deployment.rehydrate(rehydrateDeploymentRow(row));
      },
    );
  }
}
