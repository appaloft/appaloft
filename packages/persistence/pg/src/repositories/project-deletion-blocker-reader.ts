import {
  appaloftTraceAttributes,
  createRepositorySpanName,
  type ProjectDeleteBlockerKind,
  type ProjectDeletionBlocker,
  type ProjectDeletionBlockerReader,
  type RepositoryContext,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Kysely } from "kysely";

import { type Database } from "../schema";
import { resolveRepositoryExecutor } from "./shared";

type ProjectRetainedBlockerKind = Exclude<ProjectDeleteBlockerKind, "active-project">;

function blockerFromRows(
  kind: ProjectRetainedBlockerKind,
  relatedEntityType: string,
  rows: Array<{ id: string }>,
): ProjectDeletionBlocker | null {
  if (rows.length === 0) {
    return null;
  }

  return {
    kind,
    relatedEntityType,
    ...(rows[0] ? { relatedEntityId: rows[0].id } : {}),
    count: rows.length,
  };
}

export class PgProjectDeletionBlockerReader implements ProjectDeletionBlockerReader {
  constructor(private readonly db: Kysely<Database>) {}

  async findBlockers(
    context: RepositoryContext,
    input: { projectId: string },
  ): Promise<Result<ProjectDeletionBlocker[]>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("project_deletion_blocker", "find_blockers"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "project_deletion_blocker",
        },
      },
      async () => {
        try {
          const environmentRows = await executor
            .selectFrom("environments")
            .select("id")
            .where("project_id", "=", input.projectId)
            .where("lifecycle_status", "!=", "archived")
            .execute();
          const resourceRows = await executor
            .selectFrom("resources")
            .select("id")
            .where("project_id", "=", input.projectId)
            .where("lifecycle_status", "!=", "deleted")
            .execute();
          const deploymentRows = await executor
            .selectFrom("deployments")
            .select("id")
            .where("project_id", "=", input.projectId)
            .execute();
          const domainBindingRows = await executor
            .selectFrom("domain_bindings")
            .select("id")
            .where("project_id", "=", input.projectId)
            .execute();
          const certificateRows = await executor
            .selectFrom("certificates")
            .innerJoin("domain_bindings", "domain_bindings.id", "certificates.domain_binding_id")
            .select("certificates.id as id")
            .where("domain_bindings.project_id", "=", input.projectId)
            .execute();
          const sourceLinkRows = await executor
            .selectFrom("source_links")
            .select("source_fingerprint as id")
            .where("project_id", "=", input.projectId)
            .execute();
          const sourceEventRows = await executor
            .selectFrom("source_events")
            .select("id")
            .where("project_id", "=", input.projectId)
            .execute();
          const dependencyResourceRows = await executor
            .selectFrom("dependency_resources")
            .select("id")
            .where("project_id", "=", input.projectId)
            .where("lifecycle_status", "!=", "deleted")
            .execute();
          const storageVolumeRows = await executor
            .selectFrom("storage_volumes")
            .select("id")
            .where("project_id", "=", input.projectId)
            .where("lifecycle_status", "!=", "deleted")
            .execute();
          const scheduledTaskRows = await executor
            .selectFrom("scheduled_task_definitions")
            .innerJoin("resources", "resources.id", "scheduled_task_definitions.resource_id")
            .select("scheduled_task_definitions.id as id")
            .where("resources.project_id", "=", input.projectId)
            .execute();
          const previewEnvironmentRows = await executor
            .selectFrom("preview_environments")
            .select("id")
            .where("project_id", "=", input.projectId)
            .execute();
          const runtimeMonitoringRows = await executor
            .selectFrom("runtime_monitoring_samples")
            .select("id")
            .where("project_id", "=", input.projectId)
            .execute();
          const runtimeLogRows = await executor
            .selectFrom("resource_runtime_log_archives")
            .innerJoin("resources", "resources.id", "resource_runtime_log_archives.resource_id")
            .select("resource_runtime_log_archives.id as id")
            .where("resources.project_id", "=", input.projectId)
            .execute();
          const providerJobLogRows = await executor
            .selectFrom("provider_job_logs")
            .innerJoin("deployments", "deployments.id", "provider_job_logs.deployment_id")
            .select("provider_job_logs.id as id")
            .where("deployments.project_id", "=", input.projectId)
            .execute();
          const domainEventRows = await executor
            .selectFrom("domain_event_stream_records")
            .select("id")
            .where("aggregate_id", "=", input.projectId)
            .execute();
          const auditRows = await executor
            .selectFrom("audit_logs")
            .select("id")
            .where("aggregate_id", "=", input.projectId)
            .execute();

          const blockers = [
            blockerFromRows("environment", "environment", environmentRows),
            blockerFromRows("resource", "resource", resourceRows),
            blockerFromRows("deployment-history", "deployment", deploymentRows),
            blockerFromRows("domain-binding", "domain-binding", domainBindingRows),
            blockerFromRows("certificate", "certificate", certificateRows),
            blockerFromRows("source-link", "source-link", sourceLinkRows),
            blockerFromRows("source-event", "source-event", sourceEventRows),
            blockerFromRows("dependency-resource", "dependency-resource", dependencyResourceRows),
            blockerFromRows("storage-volume", "storage-volume", storageVolumeRows),
            blockerFromRows("scheduled-task", "scheduled-task", scheduledTaskRows),
            blockerFromRows("preview-environment", "preview-environment", previewEnvironmentRows),
            blockerFromRows(
              "runtime-monitoring",
              "runtime-monitoring-sample",
              runtimeMonitoringRows,
            ),
            blockerFromRows("runtime-log-retention", "runtime-log-archive", runtimeLogRows),
            blockerFromRows("provider-job-log", "provider-job-log", providerJobLogRows),
            blockerFromRows("domain-event-retention", "domain-event", domainEventRows),
            blockerFromRows("audit-retention", "audit-log", auditRows),
          ].filter((blocker): blocker is ProjectDeletionBlocker => blocker !== null);

          return ok(blockers);
        } catch (error) {
          return err(
            domainError.infra("Project deletion blockers could not be read", {
              phase: "project-delete-check-read",
              projectId: input.projectId,
              adapter: "persistence.pg",
              operation: "project-deletion-blocker.find",
              errorMessage: error instanceof Error ? error.message : String(error),
            }),
          );
        }
      },
    );
  }
}
