import {
  type DeploymentLogPruneInput,
  type DeploymentLogPruneStoreResult,
  type DeploymentLogRetentionStore,
  type RepositoryContext,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Kysely } from "kysely";

import { type Database } from "../schema";
import { resolveRepositoryExecutor } from "./shared";

interface StoredDeploymentLogEntry {
  timestamp?: unknown;
  source?: unknown;
  phase?: unknown;
  level?: unknown;
  message?: unknown;
  [key: string]: unknown;
}

export class PgDeploymentLogRetentionStore implements DeploymentLogRetentionStore {
  constructor(private readonly db: Kysely<Database>) {}

  async prune(
    context: RepositoryContext,
    input: DeploymentLogPruneInput,
  ): Promise<Result<DeploymentLogPruneStoreResult>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      let query = executor
        .selectFrom("deployments")
        .select(["id", "logs"])
        .$castTo<{ id: string; logs: StoredDeploymentLogEntry[] }>();

      if (input.deploymentId) {
        query = query.where("id", "=", input.deploymentId);
      }

      if (input.resourceId) {
        query = query.where("resource_id", "=", input.resourceId);
      }

      if (input.serverId) {
        query = query.where("server_id", "=", input.serverId);
      }

      const rows = await query.execute();
      const affectedRows = rows
        .map((row) => {
          const logs = Array.isArray(row.logs) ? row.logs : [];
          const retainedLogs = logs.filter((log) => !isPrunableLog(log, input.before));
          return {
            id: row.id,
            logs,
            retainedLogs,
            prunedCount: logs.length - retainedLogs.length,
          };
        })
        .filter((row) => row.prunedCount > 0);

      const matchedCount = affectedRows.reduce((sum, row) => sum + row.prunedCount, 0);

      if (!input.dryRun) {
        for (const row of affectedRows) {
          await executor
            .updateTable("deployments")
            .set({ logs: row.retainedLogs })
            .where("id", "=", row.id)
            .executeTakeFirst();
        }
      }

      return ok({
        matchedCount,
        prunedCount: input.dryRun ? 0 : matchedCount,
        affectedDeploymentCount: affectedRows.length,
      });
    } catch (error) {
      return err(
        domainError.infra("Deployment log retention prune could not be completed", {
          phase: "deployment-log-retention",
          adapter: "persistence.pg",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }
}

function isPrunableLog(log: StoredDeploymentLogEntry, before: string): boolean {
  return typeof log.timestamp === "string" && log.timestamp < before;
}
