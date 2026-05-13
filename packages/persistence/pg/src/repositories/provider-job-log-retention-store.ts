import {
  type ProviderJobLogPruneInput,
  type ProviderJobLogPruneStoreResult,
  type ProviderJobLogRetentionStore,
  type RepositoryContext,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Kysely } from "kysely";

import { type Database } from "../schema";
import { resolveRepositoryExecutor } from "./shared";

export class PgProviderJobLogRetentionStore implements ProviderJobLogRetentionStore {
  constructor(private readonly db: Kysely<Database>) {}

  async prune(
    context: RepositoryContext,
    input: ProviderJobLogPruneInput,
  ): Promise<Result<ProviderJobLogPruneStoreResult>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      let query = executor
        .selectFrom("provider_job_logs")
        .innerJoin("deployments", "deployments.id", "provider_job_logs.deployment_id")
        .select(["provider_job_logs.id", "provider_job_logs.provider_key"])
        .where("provider_job_logs.created_at", "<", input.before);

      if (input.deploymentId) {
        query = query.where("provider_job_logs.deployment_id", "=", input.deploymentId);
      }

      if (input.providerKey) {
        query = query.where("provider_job_logs.provider_key", "=", input.providerKey);
      }

      if (input.resourceId) {
        query = query.where("deployments.resource_id", "=", input.resourceId);
      }

      if (input.serverId) {
        query = query.where("deployments.server_id", "=", input.serverId);
      }

      const rows = await query.execute();
      const countsByProviderKey: Record<string, number> = {};
      for (const row of rows) {
        countsByProviderKey[row.provider_key] = (countsByProviderKey[row.provider_key] ?? 0) + 1;
      }

      if (input.dryRun || rows.length === 0) {
        return ok({
          matchedCount: rows.length,
          prunedCount: 0,
          countsByProviderKey,
        });
      }

      const deletedRows = await executor
        .deleteFrom("provider_job_logs")
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
        countsByProviderKey,
      });
    } catch (error) {
      return err(
        domainError.infra("Provider job log retention prune could not be completed", {
          phase: "provider-job-log-retention",
          adapter: "persistence.pg",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }
}
