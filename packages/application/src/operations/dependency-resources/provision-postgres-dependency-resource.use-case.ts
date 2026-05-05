import {
  CreatedAt,
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
  type EnvironmentRepository,
  type EventBus,
  type IdGenerator,
  type ManagedPostgresProviderPort,
  type ProjectRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type ProvisionPostgresDependencyResourceCommandInput } from "./provision-postgres-dependency-resource.command";

@injectable()
export class ProvisionPostgresDependencyResourceUseCase {
  constructor(
    @inject(tokens.projectRepository)
    private readonly projectRepository: ProjectRepository,
    @inject(tokens.environmentRepository)
    private readonly environmentRepository: EnvironmentRepository,
    @inject(tokens.dependencyResourceRepository)
    private readonly dependencyResourceRepository: DependencyResourceRepository,
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
  ) {}

  async execute(
    context: ExecutionContext,
    input: ProvisionPostgresDependencyResourceCommandInput,
  ): Promise<Result<{ id: string }>> {
    const repositoryContext = toRepositoryContext(context);
    const {
      clock,
      dependencyResourceRepository,
      environmentRepository,
      eventBus,
      idGenerator,
      logger,
      managedPostgresProvider,
      projectRepository,
    } = this;

    return safeTry(async function* () {
      const projectId = yield* ProjectId.create(input.projectId);
      const environmentId = yield* EnvironmentId.create(input.environmentId);
      const name = yield* ResourceInstanceName.create(input.name);
      const slug = yield* ResourceInstanceSlug.fromName(name);
      const kind = ResourceInstanceKindValue.rehydrate("postgres");
      const providerKey = yield* ProviderKey.create(
        input.providerKey ?? "appaloft-managed-postgres",
      );
      const createdAt = yield* CreatedAt.create(clock.now());
      const attemptedAt = yield* OccurredAt.create(clock.now());
      const description = DescriptionText.fromOptional(input.description);
      if (!managedPostgresProvider.supports(providerKey.value)) {
        return err(
          domainError.providerCapabilityUnsupported(
            "Provider does not support managed Postgres realization",
            {
              phase: "dependency-resource-realization-admission",
              providerKey: providerKey.value,
              operation: "dependency-resources.provision-postgres",
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
      yield* project.ensureCanAcceptMutation("dependency-resources.provision-postgres");

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
      const dependencyResource = yield* ResourceInstance.createPostgresDependencyResource({
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

      const realization = await managedPostgresProvider.realize(context, {
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
        const connectionSecretRef = realization.value.secretRef
          ? yield* DependencyResourceSecretRef.create(realization.value.secretRef)
          : undefined;
        yield* dependencyResource.markProviderRealized({
          attemptId: realizationAttemptId,
          providerResourceHandle,
          endpoint: realization.value.endpoint,
          ...(connectionSecretRef ? { connectionSecretRef } : {}),
          realizedAt,
        });
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

      return ok({ id: dependencyResource.toState().id.value });
    });
  }
}
