import {
  ActiveResourceBindingByTargetSpec,
  CreatedAt,
  domainError,
  err,
  ok,
  ResourceBinding,
  ResourceBindingId,
  ResourceBindingScopeValue,
  ResourceBindingTargetName,
  ResourceByIdSpec,
  ResourceId,
  ResourceInjectionModeValue,
  ResourceInstanceByIdSpec,
  ResourceInstanceId,
  type Result,
  safeTry,
  UpsertResourceBindingSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type DependencyResourceRepository,
  type EventBus,
  type IdGenerator,
  type ResourceDependencyBindingRepository,
  type ResourceRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type BindResourceDependencyCommandInput } from "./bind-resource-dependency.command";

@injectable()
export class BindResourceDependencyUseCase {
  constructor(
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
    @inject(tokens.dependencyResourceRepository)
    private readonly dependencyResourceRepository: DependencyResourceRepository,
    @inject(tokens.resourceDependencyBindingRepository)
    private readonly resourceDependencyBindingRepository: ResourceDependencyBindingRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: BindResourceDependencyCommandInput,
  ): Promise<Result<{ id: string }>> {
    const repositoryContext = toRepositoryContext(context);
    const {
      clock,
      dependencyResourceRepository,
      eventBus,
      idGenerator,
      logger,
      resourceDependencyBindingRepository,
      resourceRepository,
    } = this;

    return safeTry(async function* () {
      const resourceId = yield* ResourceId.create(input.resourceId);
      const dependencyResourceId = yield* ResourceInstanceId.create(input.dependencyResourceId);
      const targetName = yield* ResourceBindingTargetName.create(input.targetName);
      const scope = yield* ResourceBindingScopeValue.create(input.scope ?? "runtime-only");
      const injectionMode = yield* ResourceInjectionModeValue.create(input.injectionMode ?? "env");
      const createdAt = yield* CreatedAt.create(clock.now());

      const resource = await resourceRepository.findOne(
        repositoryContext,
        ResourceByIdSpec.create(resourceId),
      );
      if (!resource) {
        return err(domainError.notFound("resource", resourceId.value));
      }

      const dependencyResource = await dependencyResourceRepository.findOne(
        repositoryContext,
        ResourceInstanceByIdSpec.create(dependencyResourceId),
      );
      if (!dependencyResource) {
        return err(domainError.notFound("dependency_resource", dependencyResourceId.value));
      }

      const resourceState = resource.toState();
      const dependencyState = dependencyResource.toState();
      if (resourceState.lifecycleStatus.isDeleted()) {
        return err(domainError.notFound("resource", resourceId.value));
      }
      if (resourceState.lifecycleStatus.isArchived()) {
        return err(
          domainError.resourceArchived("Resource is archived", {
            phase: "resource-dependency-binding",
            resourceId: resourceId.value,
            commandName: "resources.bind-dependency",
          }),
        );
      }
      if (dependencyState.status.value !== "ready" || dependencyState.kind.value !== "postgres") {
        return err(
          domainError.validation("Dependency resource is not bindable", {
            phase: "resource-dependency-binding",
            dependencyResourceId: dependencyResourceId.value,
            dependencyResourceStatus: dependencyState.status.value,
            dependencyResourceKind: dependencyState.kind.value,
          }),
        );
      }
      if (
        !dependencyState.projectId?.equals(resourceState.projectId) ||
        !dependencyState.environmentId?.equals(resourceState.environmentId)
      ) {
        return err(
          domainError.resourceDependencyBindingContextMismatch(
            "Dependency resource does not belong to the resource context",
            {
              phase: "resource-dependency-binding",
              resourceId: resourceId.value,
              dependencyResourceId: dependencyResourceId.value,
              projectId: resourceState.projectId.value,
              environmentId: resourceState.environmentId.value,
            },
          ),
        );
      }

      const duplicate = await resourceDependencyBindingRepository.findOne(
        repositoryContext,
        ActiveResourceBindingByTargetSpec.create(resourceId, dependencyResourceId, targetName),
      );
      if (duplicate) {
        return err(
          domainError.conflict("Resource dependency binding already exists", {
            phase: "resource-dependency-binding",
            resourceId: resourceId.value,
            dependencyResourceId: dependencyResourceId.value,
            targetName: targetName.value,
          }),
        );
      }

      const binding = yield* ResourceBinding.create({
        id: ResourceBindingId.rehydrate(idGenerator.next("rbd")),
        projectId: resourceState.projectId,
        environmentId: resourceState.environmentId,
        resourceId,
        resourceInstanceId: dependencyResourceId,
        targetName,
        scope,
        injectionMode,
        createdAt,
      });

      await resourceDependencyBindingRepository.upsert(
        repositoryContext,
        binding,
        UpsertResourceBindingSpec.fromResourceBinding(binding),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, binding, undefined);
      return ok({ id: binding.toState().id.value });
    });
  }
}
