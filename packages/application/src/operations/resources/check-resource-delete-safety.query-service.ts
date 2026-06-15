import {
  type DomainError,
  domainError,
  err,
  ok,
  ResourceByIdSpec,
  ResourceId,
  type Result,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type ResourceDeleteSafety,
  type ResourceDeletionBlockerReader,
  type ResourceRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { type CheckResourceDeleteSafetyQuery } from "./check-resource-delete-safety.query";
import { buildResourceDeleteBlockers } from "./resource-delete-safety";

function withDeleteCheckDetails(error: DomainError, details: Record<string, string>): DomainError {
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      queryName: "resources.delete-check",
      ...details,
    },
  };
}

function resourceReadNotFound(resourceId: string): DomainError {
  return withDeleteCheckDetails(domainError.notFound("resource", resourceId), {
    phase: "resource-read",
    resourceId,
  });
}

function deleteCheckInfraError(resourceId: string, error: unknown): DomainError {
  return domainError.infra("Resource delete safety could not be assembled", {
    queryName: "resources.delete-check",
    phase: "resource-delete-check-read",
    resourceId,
    reason: error instanceof Error ? error.message : "unknown",
  });
}

@injectable()
export class CheckResourceDeleteSafetyQueryService {
  constructor(
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
    @inject(tokens.resourceDeletionBlockerReader)
    private readonly blockerReader: ResourceDeletionBlockerReader,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: CheckResourceDeleteSafetyQuery,
  ): Promise<Result<ResourceDeleteSafety>> {
    const resourceIdResult = ResourceId.create(query.resourceId);
    if (resourceIdResult.isErr()) {
      return err(
        withDeleteCheckDetails(resourceIdResult.error, {
          phase: "query-validation",
          resourceId: query.resourceId,
        }),
      );
    }

    const repositoryContext = toRepositoryContext(context);

    try {
      const resource = await this.resourceRepository.findOne(
        repositoryContext,
        ResourceByIdSpec.create(resourceIdResult.value),
      );
      if (!resource) {
        return err(resourceReadNotFound(query.resourceId));
      }

      const state = resource.toState();
      if (state.lifecycleStatus.isDeleted()) {
        return err(resourceReadNotFound(query.resourceId));
      }

      const lifecycleStatus = state.lifecycleStatus.isArchived() ? "archived" : "active";
      const blockerResult = await this.blockerReader.findBlockers(repositoryContext, {
        resourceId: resourceIdResult.value.value,
      });
      if (blockerResult.isErr()) {
        return err(blockerResult.error);
      }

      const blockers = buildResourceDeleteBlockers({
        resourceId: resourceIdResult.value.value,
        lifecycleStatus,
        retainedBlockers: blockerResult.value,
      });

      return ok({
        schemaVersion: "resources.delete-check/v1",
        resourceId: resourceIdResult.value.value,
        lifecycleStatus,
        eligible: lifecycleStatus === "archived" && blockers.length === 0,
        blockers,
        checkedAt: this.clock.now(),
      });
    } catch (error) {
      return err(deleteCheckInfraError(query.resourceId, error));
    }
  }
}
