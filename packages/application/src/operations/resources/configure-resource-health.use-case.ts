import {
  domainError,
  err,
  ok,
  ResourceByIdSpec,
  ResourceId,
  type Result,
  RuntimePlanStrategyValue,
  safeTry,
  UpdatedAt,
  UpsertResourceSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type AppLogger, type Clock, type EventBus, type ResourceRepository } from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type ConfigureResourceHealthCommandInput } from "./configure-resource-health.command";
import { resourceHealthCheckPolicyFromInput } from "./resource-health-policy.mapper";

@injectable()
export class ConfigureResourceHealthUseCase {
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
    input: ConfigureResourceHealthCommandInput,
  ): Promise<Result<{ id: string }>> {
    const { clock, eventBus, logger, resourceRepository } = this;
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

      const policyResult = resourceHealthCheckPolicyFromInput(input.healthCheck);
      if (policyResult.isErr()) {
        return err(policyResult.error);
      }
      const policy = policyResult.value;
      const configuredAt = yield* UpdatedAt.create(clock.now());
      const defaultStrategy = yield* RuntimePlanStrategyValue.create("auto");
      yield* resource.configureHealthPolicy({
        policy,
        configuredAt,
        defaultStrategy,
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
