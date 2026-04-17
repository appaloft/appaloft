import {
  appaloftTraceAttributes,
  createRepositorySpanName,
  type EnvironmentRepository,
  type RepositoryContext,
} from "@appaloft/application";
import {
  Environment,
  type EnvironmentByIdSpec,
  type EnvironmentByProjectAndNameSpec,
  type EnvironmentMutationSpec,
  type EnvironmentMutationSpecVisitor,
  type EnvironmentSelectionSpec,
  type EnvironmentSelectionSpecVisitor,
  type EnvironmentState,
  type UpsertEnvironmentSpec,
} from "@appaloft/core";
import { type Insertable, type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database } from "../schema";
import {
  type RepositoryExecutor,
  rehydrateEnvironmentRow,
  resolveRepositoryExecutor,
  withRepositoryTransaction,
} from "./shared";

type EnvironmentSelectionQuery = SelectQueryBuilder<
  Database,
  "environments",
  Selectable<Database["environments"]>
>;

class KyselyEnvironmentSelectionVisitor
  implements EnvironmentSelectionSpecVisitor<EnvironmentSelectionQuery>
{
  visitEnvironmentById(
    query: EnvironmentSelectionQuery,
    spec: EnvironmentByIdSpec,
  ): EnvironmentSelectionQuery {
    return query.where("id", "=", spec.id.value);
  }

  visitEnvironmentByProjectAndName(
    query: EnvironmentSelectionQuery,
    spec: EnvironmentByProjectAndNameSpec,
  ): EnvironmentSelectionQuery {
    return query.where("project_id", "=", spec.projectId.value).where("name", "=", spec.name.value);
  }
}

class KyselyEnvironmentMutationVisitor
  implements
    EnvironmentMutationSpecVisitor<{
      environment: Insertable<Database["environments"]>;
      variables: Insertable<Database["environment_variables"]>[];
    }>
{
  visitUpsertEnvironment(spec: UpsertEnvironmentSpec) {
    return {
      environment: {
        id: spec.state.id.value,
        project_id: spec.state.projectId.value,
        name: spec.state.name.value,
        kind: spec.state.kind.value,
        parent_environment_id: spec.state.parentEnvironmentId?.value ?? null,
        created_at: spec.state.createdAt.value,
      },
      variables: spec.state.variables.map(
        (variable, index): Insertable<Database["environment_variables"]> => ({
          id: `${spec.state.id.value}:${variable.key}:${variable.exposure}:${variable.scope}:${index}`,
          environment_id: spec.state.id.value,
          key: variable.key,
          value: variable.value,
          kind: variable.kind,
          exposure: variable.exposure,
          scope: variable.scope,
          is_secret: variable.isSecret,
          updated_at: variable.updatedAt,
        }),
      ),
    };
  }
}

export class PgEnvironmentRepository implements EnvironmentRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async upsert(
    context: RepositoryContext,
    environment: Environment,
    spec: EnvironmentMutationSpec,
  ): Promise<void> {
    void environment;
    const mutation = spec.accept(new KyselyEnvironmentMutationVisitor());

    await context.tracer.startActiveSpan(
      createRepositorySpanName("environment", "upsert"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "environment",
          [appaloftTraceAttributes.mutationSpecName]: spec.constructor.name,
        },
      },
      async () => {
        await withRepositoryTransaction(this.db, context, async (transaction) => {
          await transaction
            .insertInto("environments")
            .values(mutation.environment)
            .onConflict((conflict) =>
              conflict.column("id").doUpdateSet({
                name: mutation.environment.name,
                kind: mutation.environment.kind,
                parent_environment_id: mutation.environment.parent_environment_id ?? null,
              }),
            )
            .execute();

          await transaction
            .deleteFrom("environment_variables")
            .where("environment_id", "=", mutation.environment.id)
            .execute();

          if (mutation.variables.length > 0) {
            await transaction
              .insertInto("environment_variables")
              .values(mutation.variables)
              .execute();
          }
        });
      },
    );
  }

  private async loadState(
    executor: RepositoryExecutor,
    id: string,
  ): Promise<EnvironmentState | null> {
    const environmentRow = await executor
      .selectFrom("environments")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!environmentRow) {
      return null;
    }

    const variables = await executor
      .selectFrom("environment_variables")
      .selectAll()
      .where("environment_id", "=", environmentRow.id)
      .orderBy("updated_at", "asc")
      .execute();

    return rehydrateEnvironmentRow(environmentRow, variables);
  }

  async findOne(
    context: RepositoryContext,
    spec: EnvironmentSelectionSpec,
  ): Promise<Environment | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("environment", "find_one"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "environment",
          [appaloftTraceAttributes.selectionSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const environmentRow = await spec
          .accept(
            executor.selectFrom("environments").selectAll(),
            new KyselyEnvironmentSelectionVisitor(),
          )
          .executeTakeFirst();

        if (!environmentRow) {
          return null;
        }

        const state = await this.loadState(executor, environmentRow.id);
        return state ? Environment.rehydrate(state) : null;
      },
    );
  }
}
