import {
  createReadModelSpanName,
  type DeploymentReadModel,
  type RepositoryContext,
  yunduTraceAttributes,
} from "@yundu/application";
import { type Kysely } from "kysely";

import { type Database } from "../schema";
import {
  normalizeTimestamp,
  resolveRepositoryExecutor,
  type SerializedDeploymentLog,
  type SerializedEnvironmentSnapshot,
  type SerializedRuntimePlan,
} from "./shared";

export class PgDeploymentReadModel implements DeploymentReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async list(context: RepositoryContext, projectId?: string) {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("deployment", "list"),
      {
        attributes: {
          [yunduTraceAttributes.readModelName]: "deployment",
        },
      },
      async () => {
        let query = executor.selectFrom("deployments").selectAll().orderBy("created_at", "desc");

        if (projectId) {
          query = query.where("project_id", "=", projectId);
        }

        const rows = await query.execute();
        return rows.map((row) => {
          const startedAt = normalizeTimestamp(row.started_at);
          const finishedAt = normalizeTimestamp(row.finished_at);
          const runtimePlan = row.runtime_plan as unknown as SerializedRuntimePlan;
          const environmentSnapshot =
            row.environment_snapshot as unknown as SerializedEnvironmentSnapshot;
          const logs = (row.logs ?? []) as unknown as SerializedDeploymentLog[];

          return {
            id: row.id,
            projectId: row.project_id,
            environmentId: row.environment_id,
            serverId: row.server_id,
            status: row.status as Awaited<
              ReturnType<DeploymentReadModel["list"]>
            >[number]["status"],
            runtimePlan: {
              id: runtimePlan.id,
              source: {
                kind: runtimePlan.source.kind,
                locator: runtimePlan.source.locator,
                displayName: runtimePlan.source.displayName,
                ...(runtimePlan.source.metadata ? { metadata: runtimePlan.source.metadata } : {}),
              },
              buildStrategy: runtimePlan.buildStrategy,
              packagingMode: runtimePlan.packagingMode,
              execution: {
                kind: runtimePlan.execution.kind,
                ...(runtimePlan.execution.workingDirectory
                  ? { workingDirectory: runtimePlan.execution.workingDirectory }
                  : {}),
                ...(runtimePlan.execution.installCommand
                  ? { installCommand: runtimePlan.execution.installCommand }
                  : {}),
                ...(runtimePlan.execution.buildCommand
                  ? { buildCommand: runtimePlan.execution.buildCommand }
                  : {}),
                ...(runtimePlan.execution.startCommand
                  ? { startCommand: runtimePlan.execution.startCommand }
                  : {}),
                ...(runtimePlan.execution.healthCheckPath
                  ? { healthCheckPath: runtimePlan.execution.healthCheckPath }
                  : {}),
                ...(typeof runtimePlan.execution.port === "number"
                  ? { port: runtimePlan.execution.port }
                  : {}),
                ...(runtimePlan.execution.image ? { image: runtimePlan.execution.image } : {}),
                ...(runtimePlan.execution.dockerfilePath
                  ? { dockerfilePath: runtimePlan.execution.dockerfilePath }
                  : {}),
                ...(runtimePlan.execution.composeFile
                  ? { composeFile: runtimePlan.execution.composeFile }
                  : {}),
                ...(runtimePlan.execution.metadata
                  ? { metadata: runtimePlan.execution.metadata }
                  : {}),
              },
              target: {
                kind: runtimePlan.target.kind,
                providerKey: runtimePlan.target.providerKey,
                serverIds: [...runtimePlan.target.serverIds],
                ...(runtimePlan.target.metadata ? { metadata: runtimePlan.target.metadata } : {}),
              },
              detectSummary: runtimePlan.detectSummary,
              generatedAt: runtimePlan.generatedAt,
              steps: [...runtimePlan.steps],
            },
            environmentSnapshot: {
              id: environmentSnapshot.id,
              environmentId: environmentSnapshot.environmentId,
              createdAt: environmentSnapshot.createdAt,
              precedence: [...environmentSnapshot.precedence],
              variables: [...environmentSnapshot.variables],
            },
            logs: logs.map((entry) => ({
              timestamp: entry.timestamp,
              phase: entry.phase,
              level: entry.level,
              message: entry.message,
            })),
            logCount: Array.isArray(row.logs) ? row.logs.length : 0,
            createdAt: normalizeTimestamp(row.created_at) ?? row.created_at,
            ...(startedAt ? { startedAt } : {}),
            ...(finishedAt ? { finishedAt } : {}),
            ...(row.rollback_of_deployment_id
              ? { rollbackOfDeploymentId: row.rollback_of_deployment_id }
              : {}),
          };
        });
      },
    );
  }

  async findLogs(context: RepositoryContext, id: string) {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("deployment", "find_logs"),
      {
        attributes: {
          [yunduTraceAttributes.readModelName]: "deployment",
        },
      },
      async () => {
        const row = await executor
          .selectFrom("deployments")
          .select(["logs"])
          .where("id", "=", id)
          .executeTakeFirst();
        return ((row?.logs ?? []) as unknown as SerializedDeploymentLog[]).map((entry) => ({
          timestamp: entry.timestamp,
          phase: entry.phase,
          level: entry.level,
          message: entry.message,
        }));
      },
    );
  }
}
