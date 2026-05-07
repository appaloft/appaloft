import {
  domainError,
  err,
  ok,
  ResourceBindingByIdSpec,
  ResourceBindingId,
  ResourceBindingSecretRef,
  ResourceBindingSecretVersion,
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
  type DependencyBindingSecretStore,
  type EventBus,
  type IdGenerator,
  type ResourceDependencyBindingRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import {
  type RotateResourceDependencyBindingSecretCommandInput,
  type RotateResourceDependencyBindingSecretCommandResult,
} from "./rotate-resource-dependency-binding-secret.command";

@injectable()
export class RotateResourceDependencyBindingSecretUseCase {
  constructor(
    @inject(tokens.resourceDependencyBindingRepository)
    private readonly resourceDependencyBindingRepository: ResourceDependencyBindingRepository,
    @inject(tokens.dependencyBindingSecretStore)
    private readonly dependencyBindingSecretStore: DependencyBindingSecretStore,
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
    input: RotateResourceDependencyBindingSecretCommandInput,
  ): Promise<Result<RotateResourceDependencyBindingSecretCommandResult>> {
    const repositoryContext = toRepositoryContext(context);
    const {
      clock,
      dependencyBindingSecretStore,
      eventBus,
      idGenerator,
      logger,
      resourceDependencyBindingRepository,
    } = this;

    return safeTry(async function* () {
      const resourceId = yield* ResourceId.create(input.resourceId);
      const bindingId = yield* ResourceBindingId.create(input.bindingId);
      const rotatedAt = yield* UpdatedAt.create(clock.now());
      const secretVersion = yield* ResourceBindingSecretVersion.create(idGenerator.next("rbsv"));

      const binding = await resourceDependencyBindingRepository.findOne(
        repositoryContext,
        ResourceBindingByIdSpec.create(bindingId),
      );
      if (!binding?.toState().resourceId.equals(resourceId)) {
        return err(domainError.notFound("resource_dependency_binding", bindingId.value));
      }

      const secretRefValue = input.secretRef
        ? input.secretRef
        : yield* await dependencyBindingSecretStore
            .store(context, {
              bindingId: bindingId.value,
              resourceId: resourceId.value,
              secretValue: input.secretValue ?? "",
              secretVersion: secretVersion.value,
              rotatedAt: rotatedAt.value,
            })
            .then((result) => result.map((stored) => stored.secretRef));
      const secretRef = yield* ResourceBindingSecretRef.create(secretRefValue);

      yield* binding.rotateSecret({
        secretRef,
        secretVersion,
        rotatedAt,
      });

      await resourceDependencyBindingRepository.upsert(
        repositoryContext,
        binding,
        UpsertResourceBindingSpec.fromResourceBinding(binding),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, binding, undefined);
      return ok({
        id: bindingId.value,
        rotatedAt: rotatedAt.value,
        secretVersion: secretVersion.value,
      });
    });
  }
}
