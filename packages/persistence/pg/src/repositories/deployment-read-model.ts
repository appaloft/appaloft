import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  type DeploymentDependencyBindingSnapshotReferenceSummary,
  type DeploymentReadModel,
  dependencyResourceKinds,
  type RepositoryContext,
} from "@appaloft/application";
import {
  type DeploymentByIdSpec,
  type DeploymentSelectionSpecVisitor,
  type DeploymentTimelineJournalSource,
  type LatestDeploymentSpec,
  type LatestRuntimeOwningDeploymentSpec,
} from "@appaloft/core";
import { type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database } from "../schema";
import {
  defaultReadModelListLimit,
  normalizeTimestamp,
  resolveRepositoryContextOrganizationId,
  resolveRepositoryExecutor,
  type SerializedDeploymentDependencyBindingReference,
  type SerializedDeploymentTimelineEntry,
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

function deploymentTimelineSource(source: unknown): DeploymentTimelineJournalSource {
  switch (source) {
    case "appaloft":
    case "ssh":
    case "docker":
    case "application":
    case "provider":
    case "health":
    case "domain-event":
      return source;
    default:
      return "appaloft";
  }
}

function dependencyBindingReferenceKind(
  reference: SerializedDeploymentDependencyBindingReference,
): DeploymentDependencyBindingSnapshotReferenceSummary["kind"] {
  const dependencyKind = dependencyResourceKinds.find((candidate) => candidate === reference.kind);
  if (!dependencyKind) {
    throw new Error(
      `Deployment dependency binding reference kind ${reference.kind} is not supported`,
    );
  }
  return dependencyKind;
}

function toDeploymentSummary(
  row: Selectable<Database["deployments"]>,
): Awaited<ReturnType<DeploymentReadModel["list"]>>[number] {
  const startedAt = normalizeTimestamp(row.started_at);
  const finishedAt = normalizeTimestamp(row.finished_at);
  const runtimePlan = row.runtime_plan as unknown as SerializedRuntimePlan;
  const environmentSnapshot = row.environment_snapshot as unknown as SerializedEnvironmentSnapshot;
  const dependencyBindingReferences = (row.dependency_binding_references ??
    []) as unknown as SerializedDeploymentDependencyBindingReference[];
  const timeline = (row.timeline ?? []) as unknown as SerializedDeploymentTimelineEntry[];
  const sourceCommitSha = sourceCommitShaFromRuntimePlan(runtimePlan);
  const target = deploymentSummaryTargetFromRow(row);

  const summaryBase = {
    id: row.id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    resourceId: row.resource_id,
    target,
    status: row.status as Awaited<ReturnType<DeploymentReadModel["list"]>>[number]["status"],
    triggerKind: row.trigger_kind as NonNullable<
      Awaited<ReturnType<DeploymentReadModel["list"]>>[number]["triggerKind"]
    >,
    ...(row.source_deployment_id ? { sourceDeploymentId: row.source_deployment_id } : {}),
    ...(row.rollback_candidate_deployment_id
      ? { rollbackCandidateDeploymentId: row.rollback_candidate_deployment_id }
      : {}),
    ...(sourceCommitSha ? { sourceCommitSha } : {}),
    runtimePlan: {
      id: runtimePlan.id,
      source: {
        kind: runtimePlan.source.kind,
        locator: runtimePlan.source.locator,
        displayName: runtimePlan.source.displayName,
        ...(runtimePlan.source.version ? { version: runtimePlan.source.version } : {}),
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
    dependencyBindingReferences: dependencyBindingReferences.map((reference) => ({
      bindingId: reference.bindingId,
      dependencyResourceId: reference.dependencyResourceId,
      kind: dependencyBindingReferenceKind(reference),
      targetName: reference.targetName,
      scope: reference.scope,
      injectionMode: reference.injectionMode,
      snapshotReadiness: {
        status: reference.snapshotReadiness,
        ...(reference.snapshotReadinessReason ? { reason: reference.snapshotReadinessReason } : {}),
      },
    })),
    timeline: timeline.map((entry) => ({
      timestamp: entry.timestamp,
      source: deploymentTimelineSource(entry.source),
      phase: entry.phase,
      level: entry.level,
      message: entry.message,
    })),
    timelineCount: Array.isArray(row.timeline) ? row.timeline.length : 0,
    createdAt: normalizeTimestamp(row.created_at) ?? row.created_at,
    ...(startedAt ? { startedAt } : {}),
    ...(finishedAt ? { finishedAt } : {}),
    ...(row.archived_at
      ? { archivedAt: normalizeTimestamp(row.archived_at) ?? row.archived_at }
      : {}),
    ...(row.rollback_of_deployment_id
      ? { rollbackOfDeploymentId: row.rollback_of_deployment_id }
      : {}),
    ...(row.rollback_candidate_deployment_id
      ? { rollbackCandidateDeploymentId: row.rollback_candidate_deployment_id }
      : {}),
  };

  if (target.kind === "server-backed") {
    return {
      ...summaryBase,
      target,
      serverId: target.serverId,
      destinationId: target.destinationId,
    };
  }

  return {
    ...summaryBase,
    target,
  };
}

function deploymentSummaryTargetFromRow(
  row: Selectable<Database["deployments"]>,
): Awaited<ReturnType<DeploymentReadModel["list"]>>[number]["target"] {
  if (row.target_kind === "serverless-static-artifact") {
    if (
      !row.static_artifact_publication_id ||
      !row.static_artifact_id ||
      !row.static_artifact_route_url
    ) {
      throw new Error(`Deployment ${row.id} is missing serverless static artifact target fields`);
    }

    return {
      kind: "serverless-static-artifact",
      publicationId: row.static_artifact_publication_id,
      artifactId: row.static_artifact_id,
      routeUrl: row.static_artifact_route_url,
    };
  }

  if (!row.server_id || !row.destination_id) {
    throw new Error(`Deployment ${row.id} is missing server-backed target fields`);
  }

  return {
    kind: "server-backed",
    serverId: row.server_id,
    destinationId: row.destination_id,
  };
}

export class PgDeploymentReadModel implements DeploymentReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async count(
    context: RepositoryContext,
    input?: {
      projectId?: string;
      resourceId?: string;
      serverId?: string;
      includeArchived?: boolean;
      activeResourcesOnly?: boolean;
      status?: Awaited<ReturnType<DeploymentReadModel["list"]>>[number]["status"];
      statuses?: readonly Awaited<ReturnType<DeploymentReadModel["list"]>>[number]["status"][];
    },
  ) {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("deployment", "count"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "deployment",
        },
      },
      async () => {
        const organizationId = resolveRepositoryContextOrganizationId(context);
        let query = executor
          .selectFrom("deployments")
          .select((expressionBuilder) => [expressionBuilder.fn.count<number>("id").as("count")]);
        if (organizationId) {
          query = query.where(
            "project_id",
            "in",
            executor
              .selectFrom("projects")
              .select("id")
              .where("organization_id", "=", organizationId),
          );
        }

        if (input?.projectId) {
          query = query.where("project_id", "=", input.projectId);
        }

        if (input?.resourceId) {
          query = query.where("resource_id", "=", input.resourceId);
        }

        if (input?.serverId) {
          query = query.where("server_id", "=", input.serverId);
        }

        if (!input?.includeArchived) {
          query = query.where("archived_at", "is", null);
        }

        if (input?.activeResourcesOnly) {
          query = query.where(
            "resource_id",
            "in",
            executor.selectFrom("resources").select("id").where("lifecycle_status", "=", "active"),
          );
        }

        if (input?.status) {
          query = query.where("status", "=", input.status);
        }

        if (input?.statuses?.length) {
          query = query.where("status", "in", [...input.statuses]);
        }

        const row = await query.executeTakeFirst();
        return Number(row?.count ?? 0);
      },
    );
  }

  async list(
    context: RepositoryContext,
    input?: {
      projectId?: string;
      resourceId?: string;
      serverId?: string;
      includeArchived?: boolean;
      activeResourcesOnly?: boolean;
      limit?: number;
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
        const organizationId = resolveRepositoryContextOrganizationId(context);
        let query = executor
          .selectFrom("deployments")
          .selectAll()
          .orderBy("created_at", "desc")
          .orderBy("id", "desc");
        if (organizationId) {
          query = query.where(
            "project_id",
            "in",
            executor
              .selectFrom("projects")
              .select("id")
              .where("organization_id", "=", organizationId),
          );
        }

        if (input?.projectId) {
          query = query.where("project_id", "=", input.projectId);
        }

        if (input?.resourceId) {
          query = query.where("resource_id", "=", input.resourceId);
        }

        if (input?.serverId) {
          query = query.where("server_id", "=", input.serverId);
        }

        if (!input?.includeArchived) {
          query = query.where("archived_at", "is", null);
        }

        if (input?.activeResourcesOnly) {
          query = query.where(
            "resource_id",
            "in",
            executor.selectFrom("resources").select("id").where("lifecycle_status", "=", "active"),
          );
        }

        query = query.limit(input?.limit ?? defaultReadModelListLimit);

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
        const organizationId = resolveRepositoryContextOrganizationId(context);
        let query = spec.accept(
          executor.selectFrom("deployments").selectAll(),
          new KyselyDeploymentSelectionVisitor(),
        );
        if (organizationId) {
          query = query.where(
            "project_id",
            "in",
            executor
              .selectFrom("projects")
              .select("id")
              .where("organization_id", "=", organizationId),
          );
        }
        const row = await query.executeTakeFirst();

        return row ? toDeploymentSummary(row) : null;
      },
    );
  }

  async findTimeline(context: RepositoryContext, id: string) {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("deployment", "find_timeline"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "deployment",
        },
      },
      async () => {
        const row = await executor
          .selectFrom("deployments")
          .select(["timeline"])
          .where("id", "=", id)
          .executeTakeFirst();
        return ((row?.timeline ?? []) as unknown as SerializedDeploymentTimelineEntry[]).map(
          (entry) => ({
            timestamp: entry.timestamp,
            source: deploymentTimelineSource(entry.source),
            phase: entry.phase,
            level: entry.level,
            message: entry.message,
          }),
        );
      },
    );
  }
}
