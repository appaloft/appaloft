import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  type EnvironmentReadModel,
  type RepositoryContext,
} from "@appaloft/application";
import { type Kysely } from "kysely";

import { type Database } from "../schema";
import {
  type EnvironmentVariableRow,
  normalizeTimestamp,
  resolveRepositoryExecutor,
} from "./shared";

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

        return rows.map((row) => ({
          id: row.id,
          projectId: row.project_id,
          name: row.name,
          kind: row.kind as Awaited<ReturnType<EnvironmentReadModel["list"]>>[number]["kind"],
          createdAt: normalizeTimestamp(row.created_at) ?? row.created_at,
          maskedVariables: (variableMap.get(row.id) ?? []).map((variable) => ({
            key: variable.key,
            value: variable.is_secret ? this.secretMask : variable.value,
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
        }));
      },
    );
  }

  async findById(context: RepositoryContext, id: string) {
    const items = await this.list(context);
    return items.find((item) => item.id === id) ?? null;
  }
}
