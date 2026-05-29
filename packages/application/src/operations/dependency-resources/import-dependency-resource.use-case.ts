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
import { findOperationCatalogEntryByKey } from "../../operation-catalog";
import { checkOperationGuards } from "../../operation-guard";
import {
  AllowAllOperationGuardPort,
  type AppLogger,
  type Clock,
  type DependencyResourceReadModel,
  type DependencyResourceRepository,
  type DependencyResourceSecretStore,
  type EnvironmentRepository,
  type EventBus,
  type IdGenerator,
  type OperationGuardPort,
  type ProjectRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { maskDependencyConnectionUrl } from "./dependency-connection-masking";
import { type ImportDependencyResourceCommandInput } from "./import-dependency-resource.command";

const importDependencyResourceOperation = "dependency-resources.import";
const importDependencyResourceOperationEntry = findOperationCatalogEntryByKey(
  importDependencyResourceOperation,
);
const defaultOperationGuardPort = new AllowAllOperationGuardPort();

@injectable()
export class ImportDependencyResourceUseCase {
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
    @inject(tokens.operationGuardPort)
    private readonly operationGuardPort?: OperationGuardPort,
    @inject(tokens.dependencyResourceReadModel, { isOptional: true })
    private readonly dependencyResourceReadModel?: DependencyResourceReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ImportDependencyResourceCommandInput,
  ): Promise<Result<{ id: string }>> {
    const repositoryContext = toRepositoryContext(context);
    const {
      clock,
      dependencyResourceReadModel,
      dependencyResourceRepository,
      dependencyResourceSecretStore,
      environmentRepository,
      eventBus,
      idGenerator,
      logger,
      operationGuardPort,
      projectRepository,
    } = this;

    return safeTry(async function* () {
      const projectId = yield* ProjectId.create(input.projectId);
      const environmentId = yield* EnvironmentId.create(input.environmentId);
      const name = yield* ResourceInstanceName.create(input.name);
      const slug = yield* ResourceInstanceSlug.fromName(name);
      const kind = ResourceInstanceKindValue.rehydrate(input.kind);
      const endpoint = yield* maskDependencyConnectionUrl({
        kind: input.kind,
        connectionUrl: input.connectionUrl,
      });
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
      const projectState = project.toState();

      if (importDependencyResourceOperationEntry) {
        const checked = await checkOperationGuards({
          context,
          entry: importDependencyResourceOperationEntry,
          message: input,
          operationGuardPort: operationGuardPort ?? defaultOperationGuardPort,
          ...(projectState.organizationId
            ? { organizationId: projectState.organizationId.value }
            : {}),
          resourceRefs: {
            projectId: projectId.value,
            environmentId: environmentId.value,
          },
          contextAttributes: {
            estimatedFieldCount: input.backupRelationship ? 6 : 4,
            estimatedInputBytes: input.connectionUrl.length + (input.connectionSecret?.length ?? 0),
            estimatedItemCount: 1,
            estimatedNestingDepth: input.backupRelationship ? 2 : 1,
            estimatedSecretCount: input.secretRef ? 0 : 1,
            estimatedWriteUnits: 2,
            ...(dependencyResourceReadModel
              ? {
                  currentEnvironmentDependencyResourceCount:
                    await dependencyResourceReadModel.count(repositoryContext, {
                      environmentId: environmentId.value,
                      projectId: projectId.value,
                    }),
                  currentProjectDependencyResourceCount: await dependencyResourceReadModel.count(
                    repositoryContext,
                    {
                      projectId: projectId.value,
                    },
                  ),
                }
              : {}),
          },
        });
        if (checked.isErr()) {
          return err(checked.error);
        }
      }
      yield* project.ensureCanAcceptMutation(importDependencyResourceOperation);

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

      const secretValue = input.connectionSecret ?? input.connectionUrl;
      const secretRefValue =
        input.secretRef ??
        (yield* await dependencyResourceSecretStore
          .storeConnection(context, {
            dependencyResourceId: dependencyResourceId.value,
            projectId: projectId.value,
            environmentId: environmentId.value,
            kind: input.kind,
            purpose: "connection",
            secretValue,
            storedAt: createdAt.value,
          })
          .then((result) => result.map((stored) => stored.secretRef)));
      const secretRef = yield* DependencyResourceSecretRef.create(secretRefValue);

      const dependencyResource = yield* ResourceInstance.createDependencyResource({
        id: dependencyResourceId,
        projectId,
        environmentId,
        name,
        kind,
        sourceMode: DependencyResourceSourceModeValue.rehydrate("imported-external"),
        providerKey: ProviderKey.rehydrate(`external-${input.kind}`),
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
