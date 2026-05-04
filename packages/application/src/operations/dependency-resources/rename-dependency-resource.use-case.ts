import {
  domainError,
  err,
  ok,
  ResourceInstanceByIdSpec,
  ResourceInstanceId,
  ResourceInstanceName,
  type Result,
  safeTry,
  UpdatedAt,
  UpsertResourceInstanceSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type DependencyResourceRepository,
  type EventBus,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type RenameDependencyResourceCommandInput } from "./rename-dependency-resource.command";

@injectable()
export class RenameDependencyResourceUseCase {
  constructor(
    @inject(tokens.dependencyResourceRepository)
    private readonly dependencyResourceRepository: DependencyResourceRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: RenameDependencyResourceCommandInput,
  ): Promise<Result<{ id: string }>> {
    const repositoryContext = toRepositoryContext(context);
    const { clock, dependencyResourceRepository, eventBus, logger } = this;

    return safeTry(async function* () {
      const dependencyResourceId = yield* ResourceInstanceId.create(input.dependencyResourceId);
      const name = yield* ResourceInstanceName.create(input.name);
      const renamedAt = yield* UpdatedAt.create(clock.now());
      const dependencyResource = await dependencyResourceRepository.findOne(
        repositoryContext,
        ResourceInstanceByIdSpec.create(dependencyResourceId),
      );
      if (!dependencyResource) {
        return err(domainError.notFound("dependency_resource", dependencyResourceId.value));
      }
      yield* dependencyResource.rename({ name, renamedAt });
      await dependencyResourceRepository.upsert(
        repositoryContext,
        dependencyResource,
        UpsertResourceInstanceSpec.fromResourceInstance(dependencyResource),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, dependencyResource, undefined);
      return ok({ id: dependencyResourceId.value });
    });
  }
}
