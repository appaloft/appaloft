import {
  appaloftTraceAttributes,
  createRepositorySpanName,
  type DeploymentRepository,
  type RepositoryContext,
} from "@appaloft/application";
import {
  Deployment,
  type DeploymentByIdSpec,
  type DeploymentMutationSpec,
  type DeploymentMutationSpecVisitor,
  type DeploymentSelectionSpec,
  type DeploymentSelectionSpecVisitor,
  domainError,
  err,
  type LatestDeploymentSpec,
  type LatestRuntimeOwningDeploymentSpec,
  ok,
  type Result,
  type UpsertDeploymentSpec,
} from "@appaloft/core";
import { type Insertable, type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database } from "../schema";
import {
  rehydrateDeploymentRow,
  resolveRepositoryExecutor,
  serializeDeploymentDependencyBindingReferences,
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

  visitLatestRuntimeOwningDeployment(
    query: DeploymentSelectionQuery,
    spec: LatestRuntimeOwningDeploymentSpec,
  ): DeploymentSelectionQuery {
    return query
      .where("resource_id", "=", spec.resourceId.value)
      .where((builder) =>
        builder.or([builder("status", "=", "succeeded"), builder("status", "=", "rolled-back")]),
      )
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
        dependency_binding_references: serializeDeploymentDependencyBindingReferences(
          spec.state.dependencyBindingReferences,
        ),
        logs: serializeDeploymentLogs(spec.state.logs),
        created_at: spec.state.createdAt.value,
        started_at: spec.state.startedAt?.value ?? null,
        finished_at: spec.state.finishedAt?.value ?? null,
        trigger_kind: spec.state.triggerKind.value,
        source_deployment_id: spec.state.sourceDeploymentId?.value ?? null,
        rollback_candidate_deployment_id: spec.state.rollbackCandidateDeploymentId?.value ?? null,
        rollback_of_deployment_id: spec.state.rollbackOfDeploymentId?.value ?? null,
        supersedes_deployment_id: spec.state.supersedesDeploymentId?.value ?? null,
        superseded_by_deployment_id: spec.state.supersededByDeploymentId?.value ?? null,
      },
    };
  }
}

export class PgDeploymentRepository implements DeploymentRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async insertOne(
    context: RepositoryContext,
    deployment: Deployment,
    spec: DeploymentMutationSpec,
  ): Promise<Result<void>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const state = deployment.toState();
    const mutation = spec.accept(new KyselyDeploymentMutationVisitor());

    try {
      await context.tracer.startActiveSpan(
        createRepositorySpanName("deployment", "insert_one"),
        {
          attributes: {
            [appaloftTraceAttributes.repositoryName]: "deployment",
            [appaloftTraceAttributes.mutationSpecName]: spec.constructor.name,
          },
        },
        async () => {
          await executor.insertInto("deployments").values(mutation.values).execute();
        },
      );

      return ok(undefined);
    } catch (error) {
      if (isActiveDeploymentConstraintViolation(error)) {
        const activeRow = await executor
          .selectFrom("deployments")
          .selectAll()
          .where("resource_id", "=", state.resourceId.value)
          .where((builder) =>
            builder.or([
              builder("status", "=", "created"),
              builder("status", "=", "planning"),
              builder("status", "=", "planned"),
              builder("status", "=", "running"),
              builder("status", "=", "cancel-requested"),
            ]),
          )
          .orderBy("created_at", "desc")
          .orderBy("id", "desc")
          .executeTakeFirst();

        return err(
          domainError.conflict("Deployment insert conflicts with current persistence state", {
            aggregateRoot: "deployment",
            constraint: "deployments_active_resource_unique",
            resourceId: state.resourceId.value,
            ...(activeRow ? { deploymentId: activeRow.id, status: activeRow.status } : {}),
          }),
        );
      }

      const errorMetadata: Record<string, string | number | boolean | null> = {
        aggregateRoot: "deployment",
        operation: "insertOne",
        deploymentId: state.id.value,
        resourceId: state.resourceId.value,
      };
      const errorMessage = safeErrorMessage(error);

      if (errorMessage) {
        errorMetadata.message = errorMessage;
      }

      return err(domainError.infra("Deployment could not be inserted", errorMetadata));
    }
  }

  async updateOne(
    context: RepositoryContext,
    deployment: Deployment,
    spec: DeploymentMutationSpec,
  ): Promise<Result<void>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const state = deployment.toState();
    const mutation = spec.accept(new KyselyDeploymentMutationVisitor());
    const updateResult = await context.tracer.startActiveSpan(
      createRepositorySpanName("deployment", "update_one"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "deployment",
          [appaloftTraceAttributes.mutationSpecName]: spec.constructor.name,
        },
      },
      async () => {
        return await executor
          .updateTable("deployments")
          .set({
            resource_id: mutation.values.resource_id,
            server_id: mutation.values.server_id,
            destination_id: mutation.values.destination_id,
            status: mutation.values.status,
            runtime_plan: mutation.values.runtime_plan as unknown as Record<string, unknown>,
            environment_snapshot: mutation.values.environment_snapshot as unknown as Record<
              string,
              unknown
            >,
            dependency_binding_references: mutation.values
              .dependency_binding_references as unknown as Record<string, unknown>[],
            logs: mutation.values.logs as unknown as Record<string, unknown>[],
            started_at: mutation.values.started_at ?? null,
            finished_at: mutation.values.finished_at ?? null,
            trigger_kind: mutation.values.trigger_kind,
            source_deployment_id: mutation.values.source_deployment_id ?? null,
            rollback_of_deployment_id: mutation.values.rollback_of_deployment_id ?? null,
            supersedes_deployment_id: mutation.values.supersedes_deployment_id ?? null,
            superseded_by_deployment_id: mutation.values.superseded_by_deployment_id ?? null,
          })
          .where("id", "=", state.id.value)
          .where((builder) =>
            mutation.values.superseded_by_deployment_id
              ? builder.or([
                  builder("superseded_by_deployment_id", "is", null),
                  builder(
                    "superseded_by_deployment_id",
                    "=",
                    mutation.values.superseded_by_deployment_id,
                  ),
                ])
              : builder("superseded_by_deployment_id", "is", null),
          )
          .executeTakeFirst();
      },
    );

    if (Number(updateResult.numUpdatedRows ?? 0) > 0) {
      return ok(undefined);
    }

    const currentRow = await executor
      .selectFrom("deployments")
      .select(["id", "status", "resource_id", "superseded_by_deployment_id"])
      .where("id", "=", state.id.value)
      .executeTakeFirst();

    if (currentRow?.superseded_by_deployment_id) {
      return err(
        domainError.conflict("Deployment update conflicts with current persistence state", {
          aggregateRoot: "deployment",
          reason: "stale_write",
          deploymentId: state.id.value,
          resourceId: currentRow.resource_id,
          status: currentRow.status,
          supersededByDeploymentId: currentRow.superseded_by_deployment_id,
        }),
      );
    }

    return err(
      domainError.infra("Deployment could not be updated", {
        aggregateRoot: "deployment",
        deploymentId: state.id.value,
        resourceId: state.resourceId.value,
        operation: "updateOne",
      }),
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
          [appaloftTraceAttributes.repositoryName]: "deployment",
          [appaloftTraceAttributes.selectionSpecName]: spec.constructor.name,
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

function isActiveDeploymentConstraintViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  const message =
    "message" in error && typeof error.message === "string" ? error.message : undefined;

  return (
    code === "23505" ||
    code === "SQLITE_CONSTRAINT_UNIQUE" ||
    message?.includes("deployments_active_resource_unique") === true
  );
}

function safeErrorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}
