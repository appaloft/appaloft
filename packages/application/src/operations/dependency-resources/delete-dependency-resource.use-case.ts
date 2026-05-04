import {
  DeletedAt,
  type DependencyResourceDeleteBlockerState,
  domainError,
  err,
  ok,
  ResourceInstanceByIdSpec,
  ResourceInstanceId,
  type Result,
  safeTry,
  UpsertResourceInstanceSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type DependencyResourceDeleteSafetyReader,
  type DependencyResourceRepository,
  type EventBus,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type DeleteDependencyResourceCommandInput } from "./delete-dependency-resource.command";

@injectable()
export class DeleteDependencyResourceUseCase {
  constructor(
    @inject(tokens.dependencyResourceRepository)
    private readonly dependencyResourceRepository: DependencyResourceRepository,
    @inject(tokens.dependencyResourceDeleteSafetyReader)
    private readonly dependencyResourceDeleteSafetyReader: DependencyResourceDeleteSafetyReader,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: DeleteDependencyResourceCommandInput,
  ): Promise<Result<{ id: string }>> {
    const repositoryContext = toRepositoryContext(context);
    const {
      clock,
      dependencyResourceDeleteSafetyReader,
      dependencyResourceRepository,
      eventBus,
      logger,
    } = this;

    return safeTry(async function* () {
      const dependencyResourceId = yield* ResourceInstanceId.create(input.dependencyResourceId);
      const deletedAt = yield* DeletedAt.create(clock.now());
      const dependencyResource = await dependencyResourceRepository.findOne(
        repositoryContext,
        ResourceInstanceByIdSpec.create(dependencyResourceId),
      );
      if (!dependencyResource) {
        return err(domainError.notFound("dependency_resource", dependencyResourceId.value));
      }
      const blockersResult = await dependencyResourceDeleteSafetyReader.findBlockers(
        repositoryContext,
        { dependencyResourceId: dependencyResourceId.value },
      );
      if (blockersResult.isErr()) {
        return err(blockersResult.error);
      }
      const blockers: DependencyResourceDeleteBlockerState[] = blockersResult.value.map(
        (blocker) => ({
          kind: blocker.kind,
          ...(blocker.relatedEntityId ? { relatedEntityId: blocker.relatedEntityId } : {}),
          ...(blocker.relatedEntityType ? { relatedEntityType: blocker.relatedEntityType } : {}),
          ...(blocker.count ? { count: blocker.count } : {}),
        }),
      );
      yield* dependencyResource.delete({ deletedAt, blockers });
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
