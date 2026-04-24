import {
  ConfigKey,
  ConfigValueText,
  domainError,
  err,
  ok,
  ResourceByIdSpec,
  ResourceId,
  type Result,
  safeTry,
  UpdatedAt,
  UpsertResourceSpec,
  VariableExposureValue,
  VariableKindValue,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type AppLogger, type Clock, type EventBus, type ResourceRepository } from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type SetResourceVariableCommandInput } from "./set-resource-variable.command";

@injectable()
export class SetResourceVariableUseCase {
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
    input: SetResourceVariableCommandInput,
  ): Promise<Result<void>> {
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

      const key = yield* ConfigKey.create(input.key);
      const value = yield* ConfigValueText.create(input.value);
      const kind = yield* VariableKindValue.create(input.kind);
      const exposure = yield* VariableExposureValue.create(input.exposure);
      const updatedAt = yield* UpdatedAt.create(clock.now());

      yield* resource.setVariable({
        key,
        value,
        kind,
        exposure,
        ...(typeof input.isSecret === "boolean" ? { isSecret: input.isSecret } : {}),
        updatedAt,
      });

      await resourceRepository.upsert(
        repositoryContext,
        resource,
        UpsertResourceSpec.fromResource(resource),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, resource, undefined);
      return ok(undefined);
    });
  }
}
