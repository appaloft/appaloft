import {
  CreatedAt,
  type DependencyResourceBindingReadinessState,
  DependencyResourceProviderFailureCode,
  DependencyResourceProviderRealizationAttemptId,
  DependencyResourceProviderRealizationStatusValue,
  DependencyResourceProviderResourceHandle,
  DependencyResourceSecretRef,
  DependencyResourceSourceModeValue,
  DescriptionText,
  domainError,
  EnvironmentByIdSpec,
  EnvironmentId,
  err,
  OccurredAt,
  ok,
  ProjectByIdSpec,
  ProjectId,
  ProviderKey,
  ResourceInstance,
  ResourceInstanceByEnvironmentAndSlugSpec,
  ResourceInstanceId,
  ResourceInstanceKindValue,
  ResourceInstanceName,
  ResourceInstanceSlug,
  type Result,
  safeTry,
  UpsertResourceInstanceSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type DependencyResourceRepository,
  type DependencyResourceSecretStore,
  type EnvironmentRepository,
  type EventBus,
  type IdGenerator,
  type ManagedRedisProviderPort,
  type ProjectRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type ProvisionRedisDependencyResourceCommandInput } from "./provision-redis-dependency-resource.command";

const appaloftOwnedDependencySecretRefPrefix = "appaloft://dependency-resources/";

function blockedBindingReadiness(reason: string): DependencyResourceBindingReadinessState {
  return {
    status: "blocked",
    reason: DescriptionText.rehydrate(reason),
  };
}

function isAppaloftOwnedDependencySecretRef(secretRef: string): boolean {
  return secretRef.startsWith(appaloftOwnedDependencySecretRefPrefix);
}

function isProviderOwnedDependencySecretRef(secretRef: string): boolean {
  return secretRef.startsWith("secret://");
}

async function resolveManagedRedisBindingReadiness(input: {
  context: ExecutionContext;
  dependencyResourceSecretStore: DependencyResourceSecretStore;
  secretRef?: string;
  secretRefValid: boolean;
}): Promise<DependencyResourceBindingReadinessState> {
  if (!input.secretRef) {
    return blockedBindingReadiness("dependency_runtime_secret_ref_missing");
  }
  if (!input.secretRefValid) {
    return blockedBindingReadiness("dependency_runtime_secret_ref_invalid");
  }
  if (isAppaloftOwnedDependencySecretRef(input.secretRef)) {
    const resolved = await input.dependencyResourceSecretStore.resolve(input.context, {
      secretRef: input.secretRef,
    });
    return resolved.isOk()
      ? { status: "ready" }
      : blockedBindingReadiness("dependency_runtime_secret_unresolved");
  }
  if (isProviderOwnedDependencySecretRef(input.secretRef)) {
    return { status: "ready" };
  }
  return blockedBindingReadiness("dependency_runtime_secret_ref_unsupported");
}

@injectable()
export class ProvisionRedisDependencyResourceUseCase {
  constructor(
    @inject(tokens.projectRepository)
    private readonly projectRepository: ProjectRepository,
    @inject(tokens.environmentRepository)
    private readonly environmentRepository: EnvironmentRepository,
    @inject(tokens.dependencyResourceRepository)
    private readonly dependencyResourceRepository: DependencyResourceRepository,
    @inject(tokens.dependencyResourceSecretStore)
    private readonly dependencyResourceSecretStore: DependencyResourceSecretStore,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
    @inject(tokens.managedRedisProvider)
    private readonly managedRedisProvider: ManagedRedisProviderPort,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ProvisionRedisDependencyResourceCommandInput,
  ): Promise<Result<{ id: string }>> {
    const repositoryContext = toRepositoryContext(context);
    const {
      clock,
      dependencyResourceRepository,
      dependencyResourceSecretStore,
      environmentRepository,
      eventBus,
      idGenerator,
      logger,
      managedRedisProvider,
      projectRepository,
    } = this;

    return safeTry(async function* () {
      const projectId = yield* ProjectId.create(input.projectId);
      const environmentId = yield* EnvironmentId.create(input.environmentId);
      const name = yield* ResourceInstanceName.create(input.name);
      const slug = yield* ResourceInstanceSlug.fromName(name);
      const kind = ResourceInstanceKindValue.rehydrate("redis");
      const providerKey = yield* ProviderKey.create(input.providerKey ?? "appaloft-managed-redis");
      const createdAt = yield* CreatedAt.create(clock.now());
      const attemptedAt = yield* OccurredAt.create(clock.now());
      const description = DescriptionText.fromOptional(input.description);
      if (!managedRedisProvider.supports(providerKey.value)) {
        return err(
          domainError.providerCapabilityUnsupported(
            "Provider does not support managed Redis realization",
            {
              phase: "dependency-resource-realization-admission",
              providerKey: providerKey.value,
              operation: "dependency-resources.provision-redis",
            },
          ),
        );
      }

      const project = await projectRepository.findOne(
        repositoryContext,
        ProjectByIdSpec.create(projectId),
      );
      if (!project) {
        return err(domainError.notFound("project", projectId.value));
      }
      yield* project.ensureCanAcceptMutation("dependency-resources.provision-redis");

      const environment = await environmentRepository.findOne(
        repositoryContext,
        EnvironmentByIdSpec.create(environmentId),
      );
      if (!environment) {
        return err(domainError.notFound("environment", environmentId.value));
      }
      if (!environment.toState().projectId.equals(projectId)) {
        return err(
          domainError.resourceContextMismatch("Environment does not belong to project", {
            phase: "context-resolution",
            projectId: projectId.value,
            environmentId: environmentId.value,
          }),
        );
      }

      const existing = await dependencyResourceRepository.findOne(
        repositoryContext,
        ResourceInstanceByEnvironmentAndSlugSpec.create(projectId, environmentId, kind, slug),
      );
      if (existing && existing.toState().status.value !== "deleted") {
        return err(
          domainError.conflict("dependency_resource_slug_conflict", {
            phase: "dependency-resource-validation",
            projectId: projectId.value,
            environmentId: environmentId.value,
            slug: slug.value,
          }),
        );
      }

      const dependencyResourceId = ResourceInstanceId.rehydrate(idGenerator.next("rsi"));
      const realizationAttemptId = DependencyResourceProviderRealizationAttemptId.rehydrate(
        idGenerator.next("dpr"),
      );
      const dependencyResource = yield* ResourceInstance.createRedisDependencyResource({
        id: dependencyResourceId,
        projectId,
        environmentId,
        name,
        kind,
        sourceMode: DependencyResourceSourceModeValue.rehydrate("appaloft-managed"),
        providerKey,
        providerManaged: true,
        providerRealization: {
          status: DependencyResourceProviderRealizationStatusValue.pending(),
          attemptId: realizationAttemptId,
          attemptedAt,
        },
        ...(description ? { description } : {}),
        ...(input.backupRelationship
          ? {
              backupRelationship: {
                retentionRequired: input.backupRelationship.retentionRequired,
                ...(input.backupRelationship.reason
                  ? { reason: DescriptionText.rehydrate(input.backupRelationship.reason) }
                  : {}),
              },
            }
          : {}),
        createdAt,
      });

      await dependencyResourceRepository.upsert(
        repositoryContext,
        dependencyResource,
        UpsertResourceInstanceSpec.fromResourceInstance(dependencyResource),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, dependencyResource, undefined);

      const realization = await managedRedisProvider.realize(context, {
        dependencyResourceId: dependencyResourceId.value,
        projectId: projectId.value,
        environmentId: environmentId.value,
        providerKey: providerKey.value,
        name: name.value,
        slug: slug.value,
        attemptId: realizationAttemptId.value,
        requestedAt: attemptedAt.value,
      });
      if (realization.isOk()) {
        const realizedAt = yield* OccurredAt.create(realization.value.realizedAt);
        const providerResourceHandle = yield* DependencyResourceProviderResourceHandle.create(
          realization.value.providerResourceHandle,
        );
        let realizedSecretRef = realization.value.secretRef;
        let secretStoreFailureMessage: string | undefined;
        if (realization.value.connectionSecretValue) {
          const storedConnection = await dependencyResourceSecretStore.storeConnection(context, {
            dependencyResourceId: dependencyResourceId.value,
            projectId: projectId.value,
            environmentId: environmentId.value,
            kind: "redis",
            purpose: "connection",
            secretValue: realization.value.connectionSecretValue,
            storedAt: realizedAt.value,
          });
          if (storedConnection.isErr()) {
            secretStoreFailureMessage = storedConnection.error.message;
          } else {
            realizedSecretRef = storedConnection.value.secretRef;
          }
        }
        if (secretStoreFailureMessage) {
          const failureCode = yield* DependencyResourceProviderFailureCode.create(
            "dependency_secret_store_error",
          );
          yield* dependencyResource.markProviderRealizationFailed({
            attemptId: realizationAttemptId,
            failureCode,
            failureMessage: DescriptionText.rehydrate(secretStoreFailureMessage),
            failedAt: realizedAt,
          });
        } else {
          const connectionSecretRef = realizedSecretRef
            ? DependencyResourceSecretRef.create(realizedSecretRef)
            : undefined;
          const bindingReadiness = await resolveManagedRedisBindingReadiness({
            context,
            dependencyResourceSecretStore,
            ...(realizedSecretRef ? { secretRef: realizedSecretRef } : {}),
            secretRefValid: connectionSecretRef ? connectionSecretRef.isOk() : false,
          });
          yield* dependencyResource.markProviderRealized({
            attemptId: realizationAttemptId,
            providerResourceHandle,
            endpoint: realization.value.endpoint,
            ...(connectionSecretRef?.isOk()
              ? { connectionSecretRef: connectionSecretRef.value }
              : {}),
            bindingReadiness,
            realizedAt,
          });
        }
      } else {
        const failedAt = yield* OccurredAt.create(clock.now());
        const failureCode = yield* DependencyResourceProviderFailureCode.create(
          realization.error.code,
        );
        yield* dependencyResource.markProviderRealizationFailed({
          attemptId: realizationAttemptId,
          failureCode,
          failureMessage: DescriptionText.rehydrate(realization.error.message),
          failedAt,
        });
      }
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
