import {
  DeletedAt,
  type DependencyResourceDeleteBlockerState,
  DependencyResourceProviderRealizationAttemptId,
  domainError,
  err,
  OccurredAt,
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
  type IdGenerator,
  type ManagedPostgresProviderPort,
  type ManagedRedisProviderPort,
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
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
    @inject(tokens.managedPostgresProvider)
    private readonly managedPostgresProvider: ManagedPostgresProviderPort,
    @inject(tokens.managedRedisProvider)
    private readonly managedRedisProvider: ManagedRedisProviderPort,
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
      idGenerator,
      logger,
      managedPostgresProvider,
      managedRedisProvider,
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
      const dependencyState = dependencyResource.toState();
      const shouldDeleteProviderManagedDependency =
        dependencyState.providerManaged === true &&
        (dependencyState.kind.value === "postgres" || dependencyState.kind.value === "redis") &&
        dependencyState.sourceMode?.value === "appaloft-managed" &&
        blockers.length === 0 &&
        !dependencyState.backupRelationship?.retentionRequired;

      let allowProviderManaged = false;
      if (shouldDeleteProviderManagedDependency) {
        const providerRealization = dependencyState.providerRealization;
        if (
          providerRealization?.status.value === "ready" &&
          providerRealization.providerResourceHandle
        ) {
          const attemptId = DependencyResourceProviderRealizationAttemptId.rehydrate(
            idGenerator.next("dpd"),
          );
          const requestedAt = yield* OccurredAt.create(clock.now());
          yield* dependencyResource.markProviderDeleteRequested({ attemptId, requestedAt });
          await dependencyResourceRepository.upsert(
            repositoryContext,
            dependencyResource,
            UpsertResourceInstanceSpec.fromResourceInstance(dependencyResource),
          );
          await publishDomainEventsAndReturn(
            context,
            eventBus,
            logger,
            dependencyResource,
            undefined,
          );
          const providerDelete =
            dependencyState.kind.value === "postgres"
              ? await managedPostgresProvider.delete(context, {
                  dependencyResourceId: dependencyResourceId.value,
                  providerKey: dependencyState.providerKey.value,
                  providerResourceHandle: providerRealization.providerResourceHandle.value,
                  attemptId: attemptId.value,
                  requestedAt: requestedAt.value,
                })
              : await managedRedisProvider.delete(context, {
                  dependencyResourceId: dependencyResourceId.value,
                  providerKey: dependencyState.providerKey.value,
                  providerResourceHandle: providerRealization.providerResourceHandle.value,
                  attemptId: attemptId.value,
                  requestedAt: requestedAt.value,
                });
          if (providerDelete.isErr()) {
            return err(providerDelete.error);
          }
          allowProviderManaged = true;
        }
      }

      yield* dependencyResource.delete({ deletedAt, blockers, allowProviderManaged });
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
