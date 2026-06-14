import {
  type DeploymentAttemptPruneInput,
  type DeploymentAttemptPruneStoreResult,
  type DeploymentAttemptRetentionStore,
  type RepositoryContext,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Kysely } from "kysely";

import { type Database } from "../schema";
import { resolveRepositoryExecutor } from "./shared";

const terminalDeploymentStatuses = ["succeeded", "failed", "canceled", "rolled-back"] as const;

export class PgDeploymentAttemptRetentionStore implements DeploymentAttemptRetentionStore {
  constructor(private readonly db: Kysely<Database>) {}

  async prune(
    context: RepositoryContext,
    input: DeploymentAttemptPruneInput,
  ): Promise<Result<DeploymentAttemptPruneStoreResult>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      let query = executor
        .selectFrom("deployments")
        .select(["id"])
        .where("archived_at", "is not", null)
        .where("archived_at", "<", input.before)
        .where("status", "in", terminalDeploymentStatuses);

      if (input.deploymentId) {
        query = query.where("id", "=", input.deploymentId);
      }

      if (input.resourceId) {
        query = query.where("resource_id", "=", input.resourceId);
      }

      if (input.serverId) {
        query = query.where("server_id", "=", input.serverId);
      }

      const candidateIds = (await query.execute()).map((row) => row.id);

      if (candidateIds.length === 0) {
        return ok({
          matchedCount: 0,
          guardedCount: 0,
          prunedCount: 0,
          affectedDeploymentIds: [],
          guardedDeploymentIds: [],
        });
      }

      const guardedIds = await this.findGuardedDeploymentIds(context, candidateIds);
      const guardedSet = new Set(guardedIds);
      const prunableIds = candidateIds.filter((id) => !guardedSet.has(id));

      if (input.dryRun || prunableIds.length === 0) {
        return ok({
          matchedCount: candidateIds.length,
          guardedCount: guardedIds.length,
          prunedCount: 0,
          affectedDeploymentIds: prunableIds,
          guardedDeploymentIds: guardedIds,
        });
      }

      const deletedRows = await executor
        .deleteFrom("deployments")
        .where("id", "in", prunableIds)
        .returning("id")
        .execute();

      return ok({
        matchedCount: candidateIds.length,
        guardedCount: guardedIds.length,
        prunedCount: deletedRows.length,
        affectedDeploymentIds: deletedRows.map((row) => row.id),
        guardedDeploymentIds: guardedIds,
      });
    } catch (error) {
      return err(
        domainError.infra("Deployment attempt prune could not be completed", {
          phase: "deployment-attempt-retention",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }

  private async findGuardedDeploymentIds(
    context: RepositoryContext,
    candidateIds: string[],
  ): Promise<string[]> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const guarded = new Set<string>();

    const referenceRows = await executor
      .selectFrom("deployments")
      .select([
        "id",
        "source_deployment_id",
        "rollback_candidate_deployment_id",
        "rollback_of_deployment_id",
        "supersedes_deployment_id",
        "superseded_by_deployment_id",
      ])
      .where((builder) =>
        builder.or([
          builder("source_deployment_id", "in", candidateIds),
          builder("rollback_candidate_deployment_id", "in", candidateIds),
          builder("rollback_of_deployment_id", "in", candidateIds),
          builder("supersedes_deployment_id", "in", candidateIds),
          builder("superseded_by_deployment_id", "in", candidateIds),
        ]),
      )
      .execute();

    const candidateSet = new Set(candidateIds);
    for (const row of referenceRows) {
      if (candidateSet.has(row.id)) {
        continue;
      }

      for (const value of [
        row.source_deployment_id,
        row.rollback_candidate_deployment_id,
        row.rollback_of_deployment_id,
        row.supersedes_deployment_id,
        row.superseded_by_deployment_id,
      ]) {
        if (value && candidateIds.includes(value)) {
          guarded.add(value);
        }
      }
    }

    for (const table of [
      "provider_job_logs",
      "resource_runtime_control_attempts",
      "resource_runtime_log_archives",
    ] as const) {
      const rows = await executor
        .selectFrom(table)
        .select("deployment_id")
        .where("deployment_id", "in", candidateIds)
        .execute();

      for (const row of rows) {
        if (row.deployment_id) {
          guarded.add(row.deployment_id);
        }
      }
    }

    return candidateIds.filter((id) => guarded.has(id));
  }
}
