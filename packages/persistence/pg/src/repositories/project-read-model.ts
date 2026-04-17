import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  type ProjectReadModel,
  type RepositoryContext,
} from "@appaloft/application";
import { type Kysely } from "kysely";

import { type Database } from "../schema";
import { normalizeTimestamp, resolveRepositoryExecutor } from "./shared";

export class PgProjectReadModel implements ProjectReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async list(context: RepositoryContext) {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("project", "list"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "project",
        },
      },
      async () =>
        executor
          .selectFrom("projects")
          .selectAll()
          .orderBy("created_at", "desc")
          .execute()
          .then((rows) =>
            rows.map((row) => ({
              id: row.id,
              name: row.name,
              slug: row.slug,
              createdAt: normalizeTimestamp(row.created_at) ?? row.created_at,
              ...(row.description ? { description: row.description } : {}),
            })),
          ),
    );
  }
}
