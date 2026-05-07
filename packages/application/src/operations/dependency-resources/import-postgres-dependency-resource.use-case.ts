import {
  CreatedAt,
  DependencyResourceSecretRef,
  DependencyResourceSourceModeValue,
  DescriptionText,
  domainError,
  EnvironmentByIdSpec,
  EnvironmentId,
  err,
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
  type ProjectRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type ImportPostgresDependencyResourceCommandInput } from "./import-postgres-dependency-resource.command";
import { maskPostgresConnectionUrl } from "./postgres-connection-masking";

@injectable()
export class ImportPostgresDependencyResourceUseCase {
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
  ) {}

  async execute(
    context: ExecutionContext,
    input: ImportPostgresDependencyResourceCommandInput,
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
      projectRepository,
    } = this;

    return safeTry(async function* () {
      const projectId = yield* ProjectId.create(input.projectId);
      const environmentId = yield* EnvironmentId.create(input.environmentId);
      const name = yield* ResourceInstanceName.create(input.name);
      const slug = yield* ResourceInstanceSlug.fromName(name);
      const kind = ResourceInstanceKindValue.rehydrate("postgres");
      const endpoint = yield* maskPostgresConnectionUrl(input.connectionUrl);
      const createdAt = yield* CreatedAt.create(clock.now());
      const description = DescriptionText.fromOptional(input.description);
      const dependencyResourceId = ResourceInstanceId.rehydrate(idGenerator.next("rsi"));
      const project = await projectRepository.findOne(
        repositoryContext,
        ProjectByIdSpec.create(projectId),
      );
      if (!project) {
        return err(domainError.notFound("project", projectId.value));
      }
      yield* project.ensureCanAcceptMutation("dependency-resources.import-postgres");

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

      const secretRefValue =
        input.secretRef ??
        (yield* await dependencyResourceSecretStore
          .storeConnection(context, {
            dependencyResourceId: dependencyResourceId.value,
            projectId: projectId.value,
            environmentId: environmentId.value,
            kind: "postgres",
            purpose: "connection",
            secretValue: input.connectionUrl,
            storedAt: createdAt.value,
          })
          .then((result) => result.map((stored) => stored.secretRef)));
      const secretRef = yield* DependencyResourceSecretRef.create(secretRefValue);

      const dependencyResource = yield* ResourceInstance.createPostgresDependencyResource({
        id: dependencyResourceId,
        projectId,
        environmentId,
        name,
        kind,
        sourceMode: DependencyResourceSourceModeValue.rehydrate("imported-external"),
        providerKey: ProviderKey.rehydrate("external-postgres"),
        providerManaged: false,
        endpoint,
        connectionSecretRef: secretRef,
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

      return ok({ id: dependencyResourceId.value });
    });
  }
}
