import {
  DeletedAt,
  domainError,
  err,
  ok,
  ResourceByIdSpec,
  ResourceId,
  ResourceSlug,
  type Result,
  safeTry,
  UpsertResourceSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type EventBus,
  type ResourceDeletionBlocker,
  type ResourceDeletionBlockerKind,
  type ResourceDeletionBlockerReader,
  type ResourceRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type DeleteResourceCommandInput } from "./delete-resource.command";

function uniqueBlockerKinds(blockers: ResourceDeletionBlocker[]): ResourceDeletionBlockerKind[] {
  return [...new Set(blockers.map((blocker) => blocker.kind))];
}

function deletionBlockedError(input: {
  resourceId: string;
  lifecycleStatus: "active" | "archived";
  blockers: ResourceDeletionBlocker[];
}) {
  const blockerKinds = uniqueBlockerKinds(input.blockers);
  return domainError.resourceDeleteBlocked("Resource deletion is blocked by retained state", {
    phase: "resource-deletion-guard",
    resourceId: input.resourceId,
    lifecycleStatus: input.lifecycleStatus,
    deletionBlockers: blockerKinds,
    ...(input.blockers.length === 1 && input.blockers[0]?.relatedEntityId
      ? { relatedEntityId: input.blockers[0].relatedEntityId }
      : {}),
    ...(input.blockers.length === 1 && input.blockers[0]?.relatedEntityType
      ? { relatedEntityType: input.blockers[0].relatedEntityType }
      : {}),
    ...(input.blockers.length === 1 && typeof input.blockers[0]?.count === "number"
      ? { blockerCount: input.blockers[0].count }
      : {}),
  });
}

function confirmationMismatchError(input: {
  resourceId: string;
  expectedResourceSlug: string;
  actualResourceSlug: string;
}) {
  return domainError.validation("Resource slug confirmation does not match", {
    phase: "resource-deletion-guard",
    resourceId: input.resourceId,
    expectedResourceSlug: input.expectedResourceSlug,
    actualResourceSlug: input.actualResourceSlug,
  });
}

@injectable()
export class DeleteResourceUseCase {
  constructor(
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
    @inject(tokens.resourceDeletionBlockerReader)
    private readonly deletionBlockerReader: ResourceDeletionBlockerReader,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: DeleteResourceCommandInput,
  ): Promise<Result<{ id: string }>> {
    const { clock, deletionBlockerReader, eventBus, logger, resourceRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const resourceId = yield* ResourceId.create(input.resourceId);
      const resource = await resourceRepository.findOne(
        repositoryContext,
        ResourceByIdSpec.create(resourceId),
      );

      if (!resource) {
        return err(domainError.notFound("resource", input.resourceId));
      }

      const state = resource.toState();
      if (state.lifecycleStatus.isDeleted()) {
        return ok({ id: resourceId.value });
      }

      if (state.lifecycleStatus.isActive()) {
        return err(
          deletionBlockedError({
            resourceId: resourceId.value,
            lifecycleStatus: "active",
            blockers: [
              {
                kind: "active-resource",
                relatedEntityId: resourceId.value,
                relatedEntityType: "resource",
                count: 1,
              },
            ],
          }),
        );
      }

      const confirmationSlug = yield* ResourceSlug.create(input.confirmation.resourceSlug);
      if (!confirmationSlug.equals(state.slug)) {
        return err(
          confirmationMismatchError({
            resourceId: resourceId.value,
            expectedResourceSlug: state.slug.value,
            actualResourceSlug: confirmationSlug.value,
          }),
        );
      }

      const blockers = yield* await deletionBlockerReader.findBlockers(repositoryContext, {
        resourceId: resourceId.value,
      });
      if (blockers.length > 0) {
        return err(
          deletionBlockedError({
            resourceId: resourceId.value,
            lifecycleStatus: "archived",
            blockers,
          }),
        );
      }

      const deletedAt = yield* DeletedAt.create(clock.now());
      const deleteResult = yield* resource.delete({ deletedAt });
      if (!deleteResult.changed) {
        return ok({ id: resourceId.value });
      }

      await resourceRepository.upsert(
        repositoryContext,
        resource,
        UpsertResourceSpec.fromResource(resource),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, resource, undefined);

      return ok({ id: resourceId.value });
    });
  }
}
