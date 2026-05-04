import {
  domainError,
  err,
  ok,
  ResourceByIdSpec,
  ResourceId,
  ResourceStorageAttachmentId,
  type Result,
  safeTry,
  UpdatedAt,
  UpsertResourceSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type AppLogger, type Clock, type EventBus, type ResourceRepository } from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type DetachResourceStorageCommandInput } from "./detach-resource-storage.command";

@injectable()
export class DetachResourceStorageUseCase {
  constructor(
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: DetachResourceStorageCommandInput,
  ): Promise<Result<{ id: string }>> {
    const repositoryContext = toRepositoryContext(context);
    const { clock, eventBus, logger, resourceRepository } = this;

    return safeTry(async function* () {
      const resourceId = yield* ResourceId.create(input.resourceId);
      const attachmentId = yield* ResourceStorageAttachmentId.create(input.attachmentId);
      const detachedAt = yield* UpdatedAt.create(clock.now());
      const resource = await resourceRepository.findOne(
        repositoryContext,
        ResourceByIdSpec.create(resourceId),
      );

      if (!resource) {
        return err(domainError.notFound("resource", resourceId.value));
      }

      const detachResult = yield* resource.detachStorage({ attachmentId, detachedAt });
      if (!detachResult.changed) {
        return ok({ id: attachmentId.value });
      }

      await resourceRepository.upsert(
        repositoryContext,
        resource,
        UpsertResourceSpec.fromResource(resource),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, resource, undefined);

      return ok({ id: attachmentId.value });
    });
  }
}
