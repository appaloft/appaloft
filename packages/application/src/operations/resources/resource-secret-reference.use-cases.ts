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
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type ControlPlaneSecretProtector,
  type EventBus,
  type ResourceRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import {
  type CreateResourceSecretReferenceCommand,
  type ResourceSecretReferenceMutationResult,
} from "./create-resource-secret-reference.command";
import { type DeleteResourceSecretReferenceCommand } from "./delete-resource-secret-reference.command";
import { type RotateResourceSecretReferenceCommand } from "./rotate-resource-secret-reference.command";

async function loadResource(input: {
  context: ExecutionContext;
  repository: ResourceRepository;
  resourceId: string;
}) {
  const repositoryContext = toRepositoryContext(input.context);
  const resourceId = ResourceId.create(input.resourceId);
  if (resourceId.isErr()) {
    return err(resourceId.error);
  }

  const resource = await input.repository.findOne(
    repositoryContext,
    ResourceByIdSpec.create(resourceId.value),
  );

  if (!resource) {
    return err(domainError.notFound("resource", input.resourceId));
  }

  return ok({ repositoryContext, resource, resourceId: resourceId.value });
}

function mutationResult(input: {
  resourceId: string;
  key: string;
  exposure: "build-time" | "runtime";
}): ResourceSecretReferenceMutationResult {
  return {
    resourceId: input.resourceId,
    key: input.key,
    exposure: input.exposure,
  };
}

@injectable()
export class CreateResourceSecretReferenceUseCase {
  constructor(
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
    @inject(tokens.controlPlaneSecretProtector)
    private readonly secretProtector: ControlPlaneSecretProtector,
  ) {}

  async execute(
    context: ExecutionContext,
    input: CreateResourceSecretReferenceCommand,
  ): Promise<Result<ResourceSecretReferenceMutationResult>> {
    const { clock, eventBus, logger, resourceRepository, secretProtector } = this;

    return safeTry(async function* () {
      const loaded = yield* await loadResource({
        context,
        repository: resourceRepository,
        resourceId: input.resourceId,
      });
      const key = yield* ConfigKey.create(input.key);
      const protectedValue = yield* await secretProtector.protect(
        { purpose: "resource-variable" },
        input.value,
      );
      const value = yield* ConfigValueText.create(protectedValue.envelope);
      const exposure = yield* VariableExposureValue.create(input.exposure);
      const updatedAt = yield* UpdatedAt.create(clock.now());

      yield* loaded.resource.createSecretReference({
        key,
        value,
        exposure,
        updatedAt,
      });

      await resourceRepository.upsert(
        loaded.repositoryContext,
        loaded.resource,
        UpsertResourceSpec.fromResource(loaded.resource),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, loaded.resource, undefined);
      return ok(mutationResult(input));
    });
  }
}

@injectable()
export class RotateResourceSecretReferenceUseCase {
  constructor(
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
    @inject(tokens.controlPlaneSecretProtector)
    private readonly secretProtector: ControlPlaneSecretProtector,
  ) {}

  async execute(
    context: ExecutionContext,
    input: RotateResourceSecretReferenceCommand,
  ): Promise<Result<ResourceSecretReferenceMutationResult>> {
    const { clock, eventBus, logger, resourceRepository, secretProtector } = this;

    return safeTry(async function* () {
      const loaded = yield* await loadResource({
        context,
        repository: resourceRepository,
        resourceId: input.resourceId,
      });
      const key = yield* ConfigKey.create(input.key);
      const protectedValue = yield* await secretProtector.protect(
        { purpose: "resource-variable" },
        input.value,
      );
      const value = yield* ConfigValueText.create(protectedValue.envelope);
      const exposure = yield* VariableExposureValue.create(input.exposure);
      const updatedAt = yield* UpdatedAt.create(clock.now());

      yield* loaded.resource.rotateSecretReference({
        key,
        value,
        exposure,
        updatedAt,
      });

      await resourceRepository.upsert(
        loaded.repositoryContext,
        loaded.resource,
        UpsertResourceSpec.fromResource(loaded.resource),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, loaded.resource, undefined);
      return ok(mutationResult(input));
    });
  }
}

@injectable()
export class DeleteResourceSecretReferenceUseCase {
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
    input: DeleteResourceSecretReferenceCommand,
  ): Promise<Result<ResourceSecretReferenceMutationResult>> {
    const { clock, eventBus, logger, resourceRepository } = this;

    return safeTry(async function* () {
      const loaded = yield* await loadResource({
        context,
        repository: resourceRepository,
        resourceId: input.resourceId,
      });
      const key = yield* ConfigKey.create(input.key);
      const exposure = yield* VariableExposureValue.create(input.exposure);
      const updatedAt = yield* UpdatedAt.create(clock.now());

      yield* loaded.resource.deleteSecretReference({
        key,
        exposure,
        updatedAt,
      });

      await resourceRepository.upsert(
        loaded.repositoryContext,
        loaded.resource,
        UpsertResourceSpec.fromResource(loaded.resource),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, loaded.resource, undefined);
      return ok(mutationResult(input));
    });
  }
}
