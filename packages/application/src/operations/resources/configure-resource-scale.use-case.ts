import {
  domainError,
  err,
  ok,
  ReplicaCount,
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
import { type ConfigureResourceScaleCommandInput } from "./configure-resource-scale.command";

@injectable()
export class ConfigureResourceScaleUseCase {
  constructor(
    @inject(tokens.resourceRepository) private readonly resourceRepository: ResourceRepository,
    @inject(tokens.clock) private readonly clock: Clock,
    @inject(tokens.eventBus) private readonly eventBus: EventBus,
    @inject(tokens.logger) private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ConfigureResourceScaleCommandInput,
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
      const replicas = yield* ReplicaCount.create(input.scaleProfile.replicas);
      const configuredAt = yield* UpdatedAt.create(clock.now());
      yield* resource.configureScaleProfile({
        scaleProfile: {
          replicas,
          ...(input.scaleProfile.cpuRequestMillicores !== undefined
            ? { cpuRequestMillicores: input.scaleProfile.cpuRequestMillicores }
            : {}),
          ...(input.scaleProfile.cpuLimitMillicores !== undefined
            ? { cpuLimitMillicores: input.scaleProfile.cpuLimitMillicores }
            : {}),
          ...(input.scaleProfile.memoryRequestMebibytes !== undefined
            ? { memoryRequestMebibytes: input.scaleProfile.memoryRequestMebibytes }
            : {}),
          ...(input.scaleProfile.memoryLimitMebibytes !== undefined
            ? { memoryLimitMebibytes: input.scaleProfile.memoryLimitMebibytes }
            : {}),
          ...(input.scaleProfile.horizontal
            ? { horizontal: { ...input.scaleProfile.horizontal } }
            : {}),
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
