import {
  appaloftTraceAttributes,
  createRepositorySpanName,
  type RepositoryContext,
  type ResourceDeletionBlocker,
  type ResourceDeletionBlockerKind,
  type ResourceDeletionBlockerReader,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Kysely } from "kysely";

import { type Database } from "../schema";
import { resolveRepositoryExecutor } from "./shared";

function blockerFromRows(
  kind: ResourceDeletionBlockerKind,
  relatedEntityType: string,
  rows: Array<{ id: string }>,
): ResourceDeletionBlocker | null {
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

function runtimeInstanceBlocker(input: {
  deploymentId: string;
  runtimeControlAttemptId?: string;
}): ResourceDeletionBlocker {
  return {
    kind: "runtime-instance",
    relatedEntityType: input.runtimeControlAttemptId
      ? "resource-runtime-control-attempt"
      : "deployment",
    relatedEntityId: input.runtimeControlAttemptId ?? input.deploymentId,
    count: 1,
  };
}

export class PgResourceDeletionBlockerReader implements ResourceDeletionBlockerReader {
  constructor(private readonly db: Kysely<Database>) {}

  async findBlockers(
    context: RepositoryContext,
    input: {
      resourceId: string;
    },
  ): Promise<Result<ResourceDeletionBlocker[]>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("resource_deletion_blocker", "find_blockers"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "resource_deletion_blocker",
        },
      },
      async () => {
        try {
          const resourceEnvironment = await executor
            .selectFrom("resources")
            .innerJoin("environments", "environments.id", "resources.environment_id")
            .select("environments.kind as environment_kind")
            .where("resources.id", "=", input.resourceId)
            .executeTakeFirst();
          if (resourceEnvironment?.environment_kind === "preview") {
            return ok([]);
          }

          const domainBindingRows = await executor
            .selectFrom("domain_bindings")
            .select("id")
            .where("resource_id", "=", input.resourceId)
            .execute();
          const certificateRows = await executor
            .selectFrom("certificates")
            .innerJoin("domain_bindings", "domain_bindings.id", "certificates.domain_binding_id")
            .select("certificates.id as id")
            .where("domain_bindings.resource_id", "=", input.resourceId)
            .execute();
          const runtimeLogRows = await executor
            .selectFrom("resource_runtime_log_archives")
            .select("id")
            .where("resource_id", "=", input.resourceId)
            .execute();
          const sourceLinkRows = await executor
            .selectFrom("source_links")
            .select("source_fingerprint as id")
            .where("resource_id", "=", input.resourceId)
            .execute();
          const dependencyBindingRows = await executor
            .selectFrom("resource_dependency_bindings")
            .select("id")
            .where("resource_id", "=", input.resourceId)
            .where("lifecycle_status", "=", "active")
            .execute();
          const serverAppliedRouteRows = await executor
            .selectFrom("server_applied_route_states")
            .select("route_set_id as id")
            .where("resource_id", "=", input.resourceId)
            .execute();
          const currentRuntimeDeployment = await executor
            .selectFrom("deployments")
            .select("id")
            .where("resource_id", "=", input.resourceId)
            .where("status", "=", "succeeded")
            .where("target_kind", "!=", "serverless-static-artifact")
            .where("server_id", "is not", null)
            .where("archived_at", "is", null)
            .orderBy("created_at", "desc")
            .executeTakeFirst();
          const latestRuntimeControl = currentRuntimeDeployment
            ? await executor
                .selectFrom("resource_runtime_control_attempts")
                .select(["id", "runtime_state", "status"])
                .where("resource_id", "=", input.resourceId)
                .where("deployment_id", "=", currentRuntimeDeployment.id)
                .orderBy("updated_at", "desc")
                .orderBy("started_at", "desc")
                .executeTakeFirst()
            : null;
          const currentRuntimeStopped =
            latestRuntimeControl?.status === "succeeded" &&
            latestRuntimeControl.runtime_state === "stopped";
          const currentRuntimeBlocker =
            currentRuntimeDeployment && !currentRuntimeStopped
              ? runtimeInstanceBlocker({
                  deploymentId: currentRuntimeDeployment.id,
                  ...(latestRuntimeControl?.id
                    ? { runtimeControlAttemptId: latestRuntimeControl.id }
                    : {}),
                })
              : null;

          const blockers = [
            currentRuntimeBlocker,
            blockerFromRows("domain-binding", "domain-binding", domainBindingRows),
            blockerFromRows("certificate", "certificate", certificateRows),
            blockerFromRows("runtime-log-retention", "runtime-log-archive", runtimeLogRows),
            blockerFromRows("source-link", "source-link", sourceLinkRows),
            blockerFromRows(
              "dependency-binding",
              "resource-dependency-binding",
              dependencyBindingRows,
            ),
            blockerFromRows("server-applied-route", "server-applied-route", serverAppliedRouteRows),
          ].filter((blocker): blocker is ResourceDeletionBlocker => blocker !== null);

          return ok(blockers);
        } catch (error) {
          return err(
            domainError.infra("Resource deletion blockers could not be read", {
              phase: "resource-read",
              resourceId: input.resourceId,
              adapter: "persistence.pg",
              operation: "resource-deletion-blocker.find",
              errorMessage: error instanceof Error ? error.message : String(error),
            }),
          );
        }
      },
    );
  }
}
