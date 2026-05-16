import {
  type RepositoryContext,
  type SourceEventPruneInput,
  type SourceEventPruneStoreResult,
  type SourceEventRetentionStore,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";
import { resolveRepositoryExecutor } from "./shared";

export class PgSourceEventRetentionStore implements SourceEventRetentionStore {
  constructor(private readonly db: Kysely<Database>) {}

  async prune(
    context: RepositoryContext,
    input: SourceEventPruneInput,
  ): Promise<Result<SourceEventPruneStoreResult>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      let query = executor
        .selectFrom("source_events")
        .select(["id", "status", "source_kind"])
        .where("received_at", "<", input.before);

      if (input.projectId) {
        query = query.where("project_id", "=", input.projectId);
      }

      if (input.resourceId) {
        query = query.where(sql<boolean>`${input.resourceId} = ANY(matched_resource_ids)`);
      }

      if (input.status) {
        query = query.where("status", "=", input.status);
      }

      if (input.sourceKind) {
        query = query.where("source_kind", "=", input.sourceKind);
      }

      const rows = await query.execute();
      const countsByStatus: Record<string, number> = {};
      const countsBySourceKind: Record<string, number> = {};
      for (const row of rows) {
        countsByStatus[row.status] = (countsByStatus[row.status] ?? 0) + 1;
        countsBySourceKind[row.source_kind] = (countsBySourceKind[row.source_kind] ?? 0) + 1;
      }

      if (input.dryRun || rows.length === 0) {
        return ok({
          matchedCount: rows.length,
          prunedCount: 0,
          countsByStatus,
          countsBySourceKind,
        });
      }

      const deletedRows = await executor
        .deleteFrom("source_events")
        .where(
          "id",
          "in",
          rows.map((row) => row.id),
        )
        .returning("id")
        .execute();

      return ok({
        matchedCount: rows.length,
        prunedCount: deletedRows.length,
        countsByStatus,
        countsBySourceKind,
      });
    } catch (error) {
      return err(
        domainError.infra("Source event retention prune could not be completed", {
          phase: "source-event-retention",
          adapter: "persistence.pg",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }
}
