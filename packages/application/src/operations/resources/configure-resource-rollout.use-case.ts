import {
  domainError,
  err,
  ok,
  ResourceByIdSpec,
  ResourceId,
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
import { type ConfigureResourceRolloutCommandInput } from "./configure-resource-rollout.command";

@injectable()
export class ConfigureResourceRolloutUseCase {
  constructor(
    @inject(tokens.resourceRepository) private readonly resourceRepository: ResourceRepository,
    @inject(tokens.clock) private readonly clock: Clock,
    @inject(tokens.eventBus) private readonly eventBus: EventBus,
    @inject(tokens.logger) private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ConfigureResourceRolloutCommandInput,
  ): Promise<Result<{ id: string }>> {
    const { clock, eventBus, logger, resourceRepository } = this;
    const repositoryContext = toRepositoryContext(context);
    return safeTry(async function* () {
      const resourceId = yield* ResourceId.create(input.resourceId);
      const resource = await resourceRepository.findOne(
        repositoryContext,
        ResourceByIdSpec.create(resourceId),
      );
      if (!resource) return err(domainError.notFound("resource", input.resourceId));
      const configuredAt = yield* UpdatedAt.create(clock.now());
      yield* resource.configureRolloutProfile({
        rolloutProfile: {
          strategy: input.rolloutProfile.strategy,
          ...(input.rolloutProfile.maxUnavailable !== undefined
            ? { maxUnavailable: input.rolloutProfile.maxUnavailable }
            : {}),
          ...(input.rolloutProfile.maxSurge !== undefined
            ? { maxSurge: input.rolloutProfile.maxSurge }
            : {}),
          ...(input.rolloutProfile.canary ? { canary: { ...input.rolloutProfile.canary } } : {}),
        },
        configuredAt,
      });
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
