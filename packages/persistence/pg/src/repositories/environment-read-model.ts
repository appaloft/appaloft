import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  type EnvironmentReadModel,
  type RepositoryContext,
} from "@appaloft/application";
import {
  type EnvironmentByIdSpec,
  type EnvironmentByProjectAndNameSpec,
  type EnvironmentSelectionSpecVisitor,
} from "@appaloft/core";
import { type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database } from "../schema";
import {
  type EnvironmentVariableRow,
  normalizeTimestamp,
  resolveRepositoryExecutor,
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

function toEnvironmentSummary(
  row: Selectable<Database["environments"]>,
  variables: EnvironmentVariableRow[],
  secretMask: string,
): Awaited<ReturnType<EnvironmentReadModel["list"]>>[number] {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    kind: row.kind as Awaited<ReturnType<EnvironmentReadModel["list"]>>[number]["kind"],
    createdAt: normalizeTimestamp(row.created_at) ?? row.created_at,
    maskedVariables: variables.map((variable) => ({
      key: variable.key,
      value: variable.is_secret ? secretMask : variable.value,
      scope: variable.scope as Awaited<
        ReturnType<EnvironmentReadModel["list"]>
      >[number]["maskedVariables"][number]["scope"],
      exposure: variable.exposure as Awaited<
        ReturnType<EnvironmentReadModel["list"]>
      >[number]["maskedVariables"][number]["exposure"],
      isSecret: variable.is_secret,
      kind: variable.kind as Awaited<
        ReturnType<EnvironmentReadModel["list"]>
      >[number]["maskedVariables"][number]["kind"],
    })),
    ...(row.parent_environment_id ? { parentEnvironmentId: row.parent_environment_id } : {}),
  };
}

export class PgEnvironmentReadModel implements EnvironmentReadModel {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly secretMask: string,
  ) {}

  private async loadVariables(
    context: RepositoryContext,
    environmentIds: string[],
  ): Promise<Map<string, EnvironmentVariableRow[]>> {
    if (environmentIds.length === 0) {
      return new Map<string, EnvironmentVariableRow[]>();
    }

    const rows = await resolveRepositoryExecutor(this.db, context)
      .selectFrom("environment_variables")
      .selectAll()
      .where("environment_id", "in", environmentIds)
      .execute();
    const grouped = new Map<string, EnvironmentVariableRow[]>();

    for (const row of rows) {
      grouped.set(row.environment_id, [...(grouped.get(row.environment_id) ?? []), row]);
    }

    return grouped;
  }

  async list(context: RepositoryContext, projectId?: string) {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("environment", "list"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "environment",
        },
      },
      async () => {
        let query = executor.selectFrom("environments").selectAll().orderBy("created_at", "desc");

        if (projectId) {
          query = query.where("project_id", "=", projectId);
        }

        const rows = await query.execute();
        const variableMap = await this.loadVariables(
          context,
          rows.map((row) => row.id),
        );

        return rows.map((row) =>
          toEnvironmentSummary(row, variableMap.get(row.id) ?? [], this.secretMask),
        );
      },
    );
  }

  async findOne(context: RepositoryContext, spec: Parameters<EnvironmentReadModel["findOne"]>[1]) {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("environment", "find_one"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "environment",
          [appaloftTraceAttributes.selectionSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const row = await spec
          .accept(
            executor.selectFrom("environments").selectAll(),
            new KyselyEnvironmentSelectionVisitor(),
          )
          .executeTakeFirst();

        if (!row) {
          return null;
        }

        const variableMap = await this.loadVariables(context, [row.id]);
        return toEnvironmentSummary(row, variableMap.get(row.id) ?? [], this.secretMask);
      },
    );
  }
}
