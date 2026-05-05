import {
  domainError,
  err,
  ok,
  ResourceBindingByIdSpec,
  ResourceBindingId,
  ResourceId,
  type Result,
  safeTry,
  UpdatedAt,
  UpsertResourceBindingSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type EventBus,
  type ResourceDependencyBindingRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type UnbindResourceDependencyCommandInput } from "./unbind-resource-dependency.command";

@injectable()
export class UnbindResourceDependencyUseCase {
  constructor(
    @inject(tokens.resourceDependencyBindingRepository)
    private readonly resourceDependencyBindingRepository: ResourceDependencyBindingRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: UnbindResourceDependencyCommandInput,
  ): Promise<Result<{ id: string }>> {
    const repositoryContext = toRepositoryContext(context);
    const { clock, eventBus, logger, resourceDependencyBindingRepository } = this;

    return safeTry(async function* () {
      const resourceId = yield* ResourceId.create(input.resourceId);
      const bindingId = yield* ResourceBindingId.create(input.bindingId);
      const removedAt = yield* UpdatedAt.create(clock.now());
      const binding = await resourceDependencyBindingRepository.findOne(
        repositoryContext,
        ResourceBindingByIdSpec.create(bindingId),
      );
      if (!binding?.toState().resourceId.equals(resourceId)) {
        return err(domainError.notFound("resource_dependency_binding", bindingId.value));
      }

      const result = yield* binding.unbind({ removedAt });
      if (!result.changed) {
        return ok({ id: bindingId.value });
      }

      await resourceDependencyBindingRepository.upsert(
        repositoryContext,
        binding,
        UpsertResourceBindingSpec.fromResourceBinding(binding),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, binding, undefined);
      return ok({ id: bindingId.value });
    });
  }
}
