import {
  CreatedAt,
  DescriptionText,
  domainError,
  EnvironmentByIdSpec,
  EnvironmentId,
  err,
  ok,
  ProjectByIdSpec,
  ProjectId,
  type Result,
  StorageBindSourcePath,
  StorageVolume,
  StorageVolumeByEnvironmentAndSlugSpec,
  StorageVolumeId,
  StorageVolumeKindValue,
  StorageVolumeName,
  StorageVolumeSlug,
  safeTry,
  UpsertStorageVolumeSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { findOperationCatalogEntryByKey } from "../../operation-catalog";
import { checkOperationGuards } from "../../operation-guard";
import {
  AllowAllOperationGuardPort,
  type AppLogger,
  type Clock,
  type EnvironmentRepository,
  type EventBus,
  type IdGenerator,
  type OperationGuardPort,
  type ProjectRepository,
  type StorageVolumeReadModel,
  type StorageVolumeRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type CreateStorageVolumeCommandInput } from "./create-storage-volume.command";

const createStorageVolumeOperation = findOperationCatalogEntryByKey("storage-volumes.create");
const defaultOperationGuardPort = new AllowAllOperationGuardPort();

@injectable()
export class CreateStorageVolumeUseCase {
  constructor(
    @inject(tokens.projectRepository)
    private readonly projectRepository: ProjectRepository,
    @inject(tokens.environmentRepository)
    private readonly environmentRepository: EnvironmentRepository,
    @inject(tokens.storageVolumeRepository)
    private readonly storageVolumeRepository: StorageVolumeRepository,
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
    @inject(tokens.storageVolumeReadModel, { isOptional: true })
    private readonly storageVolumeReadModel?: StorageVolumeReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    input: CreateStorageVolumeCommandInput,
  ): Promise<Result<{ id: string }>> {
    const repositoryContext = toRepositoryContext(context);
    const {
      clock,
      environmentRepository,
      eventBus,
      idGenerator,
      logger,
      operationGuardPort,
      projectRepository,
      storageVolumeReadModel,
      storageVolumeRepository,
    } = this;

    return safeTry(async function* () {
      const projectId = yield* ProjectId.create(input.projectId);
      const environmentId = yield* EnvironmentId.create(input.environmentId);
      const name = yield* StorageVolumeName.create(input.name);
      const slug = yield* StorageVolumeSlug.fromName(name);
      const kind = yield* StorageVolumeKindValue.create(input.kind);
      const sourcePath = input.sourcePath
        ? yield* StorageBindSourcePath.create(input.sourcePath)
        : undefined;
      const description = DescriptionText.fromOptional(input.description);
      const createdAt = yield* CreatedAt.create(clock.now());

      if (createStorageVolumeOperation) {
        const checked = await checkOperationGuards({
          context,
          entry: createStorageVolumeOperation,
          message: input,
          operationGuardPort: operationGuardPort ?? defaultOperationGuardPort,
          resourceRefs: {
            projectId: projectId.value,
            environmentId: environmentId.value,
          },
          contextAttributes: {
            ...(storageVolumeReadModel
              ? {
                  currentEnvironmentStorageVolumeCount: (
                    await storageVolumeReadModel.list(repositoryContext, {
                      environmentId: environmentId.value,
                      projectId: projectId.value,
                    })
                  ).length,
                  currentProjectStorageVolumeCount: (
                    await storageVolumeReadModel.list(repositoryContext, {
                      projectId: projectId.value,
                    })
                  ).length,
                }
              : {}),
          },
        });
        if (checked.isErr()) {
          return err(checked.error);
        }
      }

      const project = await projectRepository.findOne(
        repositoryContext,
        ProjectByIdSpec.create(projectId),
      );
      if (!project) {
        return err(domainError.notFound("project", projectId.value));
      }
      yield* project.ensureCanAcceptMutation("storage-volumes.create");

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

      const existing = await storageVolumeRepository.findOne(
        repositoryContext,
        StorageVolumeByEnvironmentAndSlugSpec.create(projectId, environmentId, slug),
      );
      if (existing && !existing.toState().lifecycleStatus.isDeleted()) {
        return err(
          domainError.conflict("storage_volume_slug_conflict", {
            phase: "storage-volume-validation",
            projectId: projectId.value,
            environmentId: environmentId.value,
            slug: slug.value,
          }),
        );
      }

      const storageVolume = yield* StorageVolume.create({
        id: StorageVolumeId.rehydrate(idGenerator.next("stv")),
        projectId,
        environmentId,
        name,
        kind,
        ...(sourcePath ? { sourcePath } : {}),
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

      await storageVolumeRepository.upsert(
        repositoryContext,
        storageVolume,
        UpsertStorageVolumeSpec.fromStorageVolume(storageVolume),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, storageVolume, undefined);

      return ok({ id: storageVolume.id.value });
    });
  }
}
