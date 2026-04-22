import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  type DeploymentReadModel,
  type RepositoryContext,
} from "@appaloft/application";
import {
  type DeploymentByIdSpec,
  type DeploymentSelectionSpecVisitor,
  type LatestDeploymentSpec,
  type LatestRuntimeOwningDeploymentSpec,
} from "@appaloft/core";
import { type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database } from "../schema";
import {
  normalizeTimestamp,
  resolveRepositoryExecutor,
  type SerializedDeploymentLog,
  type SerializedEnvironmentSnapshot,
  type SerializedRuntimePlan,
} from "./shared";

const deploymentSourceCommitShaMetadataKey = "source.commitSha";
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

function sourceCommitShaFromRuntimePlan(runtimePlan: SerializedRuntimePlan): string | undefined {
  const executionMetadata = runtimePlan.execution.metadata ?? {};
  const sourceMetadata = runtimePlan.source.metadata ?? {};

  return (
    executionMetadata[deploymentSourceCommitShaMetadataKey] ??
    executionMetadata.commitSha ??
    sourceMetadata[deploymentSourceCommitShaMetadataKey] ??
    sourceMetadata.commitSha
  );
}

function toDeploymentSummary(
  row: Selectable<Database["deployments"]>,
): Awaited<ReturnType<DeploymentReadModel["list"]>>[number] {
  const startedAt = normalizeTimestamp(row.started_at);
  const finishedAt = normalizeTimestamp(row.finished_at);
  const runtimePlan = row.runtime_plan as unknown as SerializedRuntimePlan;
  const environmentSnapshot = row.environment_snapshot as unknown as SerializedEnvironmentSnapshot;
  const logs = (row.logs ?? []) as unknown as SerializedDeploymentLog[];
  const sourceCommitSha = sourceCommitShaFromRuntimePlan(runtimePlan);

  return {
    id: row.id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    resourceId: row.resource_id,
    serverId: row.server_id,
    destinationId: row.destination_id,
    status: row.status as Awaited<ReturnType<DeploymentReadModel["list"]>>[number]["status"],
    ...(sourceCommitSha ? { sourceCommitSha } : {}),
    runtimePlan: {
      id: runtimePlan.id,
      source: {
        kind: runtimePlan.source.kind,
        locator: runtimePlan.source.locator,
        displayName: runtimePlan.source.displayName,
        ...(runtimePlan.source.inspection
          ? {
              inspection: {
                ...(runtimePlan.source.inspection.runtimeFamily
                  ? { runtimeFamily: runtimePlan.source.inspection.runtimeFamily }
                  : {}),
                ...(runtimePlan.source.inspection.framework
                  ? { framework: runtimePlan.source.inspection.framework }
                  : {}),
                ...(runtimePlan.source.inspection.packageManager
                  ? { packageManager: runtimePlan.source.inspection.packageManager }
                  : {}),
                ...(runtimePlan.source.inspection.applicationShape
                  ? { applicationShape: runtimePlan.source.inspection.applicationShape }
                  : {}),
                ...(runtimePlan.source.inspection.runtimeVersion
                  ? { runtimeVersion: runtimePlan.source.inspection.runtimeVersion }
                  : {}),
                ...(runtimePlan.source.inspection.projectName
                  ? { projectName: runtimePlan.source.inspection.projectName }
                  : {}),
                ...(runtimePlan.source.inspection.detectedFiles?.length
                  ? { detectedFiles: [...runtimePlan.source.inspection.detectedFiles] }
                  : {}),
                ...(runtimePlan.source.inspection.detectedScripts?.length
                  ? { detectedScripts: [...runtimePlan.source.inspection.detectedScripts] }
                  : {}),
                ...(runtimePlan.source.inspection.dockerfilePath
                  ? { dockerfilePath: runtimePlan.source.inspection.dockerfilePath }
                  : {}),
                ...(runtimePlan.source.inspection.composeFilePath
                  ? { composeFilePath: runtimePlan.source.inspection.composeFilePath }
                  : {}),
                ...(runtimePlan.source.inspection.jarPath
                  ? { jarPath: runtimePlan.source.inspection.jarPath }
                  : {}),
              },
            }
          : {}),
        ...(runtimePlan.source.metadata ? { metadata: runtimePlan.source.metadata } : {}),
      },
      buildStrategy: runtimePlan.buildStrategy,
      packagingMode: runtimePlan.packagingMode,
      ...(runtimePlan.runtimeArtifact
        ? {
            runtimeArtifact: {
              kind: runtimePlan.runtimeArtifact.kind,
              intent: runtimePlan.runtimeArtifact.intent,
              ...(runtimePlan.runtimeArtifact.image
                ? { image: runtimePlan.runtimeArtifact.image }
                : {}),
              ...(runtimePlan.runtimeArtifact.composeFile
                ? { composeFile: runtimePlan.runtimeArtifact.composeFile }
                : {}),
              ...(runtimePlan.runtimeArtifact.metadata
                ? { metadata: runtimePlan.runtimeArtifact.metadata }
                : {}),
            },
          }
        : {}),
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
        ...(runtimePlan.execution.accessRoutes?.length
          ? {
              accessRoutes: runtimePlan.execution.accessRoutes.map((route) => ({
                proxyKind: route.proxyKind,
                domains: route.domains,
                pathPrefix: route.pathPrefix,
                tlsMode: route.tlsMode,
                ...(typeof route.targetPort === "number" ? { targetPort: route.targetPort } : {}),
              })),
            }
          : {}),
        ...(runtimePlan.execution.verificationSteps?.length
          ? {
              verificationSteps: runtimePlan.execution.verificationSteps.map((step) => ({
                kind: step.kind,
                label: step.label,
              })),
            }
          : {}),
        ...(runtimePlan.execution.metadata ? { metadata: runtimePlan.execution.metadata } : {}),
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
      source: entry.source ?? "appaloft",
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
}

export class PgDeploymentReadModel implements DeploymentReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async list(
    context: RepositoryContext,
    input?: {
      projectId?: string;
      resourceId?: string;
    },
  ) {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("deployment", "list"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "deployment",
        },
      },
      async () => {
        let query = executor.selectFrom("deployments").selectAll().orderBy("created_at", "desc");

        if (input?.projectId) {
          query = query.where("project_id", "=", input.projectId);
        }

        if (input?.resourceId) {
          query = query.where("resource_id", "=", input.resourceId);
        }

        const rows = await query.execute();
        return rows.map(toDeploymentSummary);
      },
    );
  }

  async findOne(context: RepositoryContext, spec: Parameters<DeploymentReadModel["findOne"]>[1]) {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("deployment", "find_one"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "deployment",
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

        return row ? toDeploymentSummary(row) : null;
      },
    );
  }

  async findLogs(context: RepositoryContext, id: string) {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("deployment", "find_logs"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "deployment",
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
          source: entry.source ?? "appaloft",
          phase: entry.phase,
          level: entry.level,
          message: entry.message,
        }));
      },
    );
  }
}
