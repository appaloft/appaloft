import {
  DependencyResourceSecretRef,
  domainError,
  err,
  ok,
  ResourceInstanceByIdSpec,
  ResourceInstanceId,
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
  type DependencyResourceKind,
  type DependencyResourceRepository,
  type DependencyResourceSecretStore,
  dependencyResourceKinds,
  type EventBus,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { maskDependencyConnectionUrl } from "./dependency-connection-masking";
import { type RotateDependencyResourceConnectionCommandInput } from "./rotate-dependency-resource-connection.command";

function isDependencyResourceKind(value: string): value is DependencyResourceKind {
  return dependencyResourceKinds.includes(value as DependencyResourceKind);
}

@injectable()
export class RotateDependencyResourceConnectionUseCase {
  constructor(
    @inject(tokens.dependencyResourceRepository)
    private readonly dependencyResourceRepository: DependencyResourceRepository,
    @inject(tokens.dependencyResourceSecretStore)
    private readonly dependencyResourceSecretStore: DependencyResourceSecretStore,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: RotateDependencyResourceConnectionCommandInput,
  ): Promise<Result<{ id: string }>> {
    const repositoryContext = toRepositoryContext(context);
    const { clock, dependencyResourceRepository, dependencyResourceSecretStore, eventBus, logger } =
      this;

    return safeTry(async function* () {
      const dependencyResourceId = yield* ResourceInstanceId.create(input.dependencyResourceId);
      const rotatedAt = yield* UpdatedAt.create(clock.now());
      const dependencyResource = await dependencyResourceRepository.findOne(
        repositoryContext,
        ResourceInstanceByIdSpec.create(dependencyResourceId),
      );
      if (!dependencyResource) {
        return err(domainError.notFound("dependency_resource", dependencyResourceId.value));
      }
      const state = dependencyResource.toState();
      if (state.providerManaged || state.sourceMode?.value !== "imported-external") {
        return err(
          domainError.validation("Only imported external dependency connections can be rotated", {
            phase: "dependency-resource-connection-rotation",
            dependencyResourceId: dependencyResourceId.value,
          }),
        );
      }
      if (state.status.value === "deleted") {
        return err(
          domainError.validation("Deleted dependency resources cannot be rotated", {
            phase: "dependency-resource-connection-rotation",
            dependencyResourceId: dependencyResourceId.value,
          }),
        );
      }
      if (!state.connectionSecretRef?.value.startsWith("appaloft://dependency-resources/")) {
        return err(
          domainError.validation("Only Appaloft-stored imported connections can be rotated", {
            phase: "dependency-resource-connection-rotation",
            dependencyResourceId: dependencyResourceId.value,
          }),
        );
      }
      if (!state.projectId || !state.environmentId || !isDependencyResourceKind(state.kind.value)) {
        return err(
          domainError.validation("Dependency resource connection context is invalid", {
            phase: "dependency-resource-connection-rotation",
            dependencyResourceId: dependencyResourceId.value,
          }),
        );
      }
      const endpoint = yield* maskDependencyConnectionUrl({
        kind: state.kind.value,
        connectionUrl: input.connectionUrl,
      });
      const stored = yield* await dependencyResourceSecretStore.storeConnection(context, {
        dependencyResourceId: dependencyResourceId.value,
        projectId: state.projectId.value,
        environmentId: state.environmentId.value,
        kind: state.kind.value,
        purpose: "connection",
        secretValue: input.connectionUrl,
        storedAt: rotatedAt.value,
      });
      const secretRef = yield* DependencyResourceSecretRef.create(stored.secretRef);
      yield* dependencyResource.rotateImportedConnection({
        endpoint,
        connectionSecretRef: secretRef,
        rotatedAt,
      });
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
