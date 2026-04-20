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
          const deploymentRows = await executor
            .selectFrom("deployments")
            .select("id")
            .where("resource_id", "=", input.resourceId)
            .execute();
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
            .selectFrom("provider_job_logs")
            .innerJoin("deployments", "deployments.id", "provider_job_logs.deployment_id")
            .select("provider_job_logs.id as id")
            .where("deployments.resource_id", "=", input.resourceId)
            .execute();

          const blockers = [
            blockerFromRows("deployment-history", "deployment", deploymentRows),
            blockerFromRows("domain-binding", "domain-binding", domainBindingRows),
            blockerFromRows("certificate", "certificate", certificateRows),
            blockerFromRows("runtime-log-retention", "runtime-log", runtimeLogRows),
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
