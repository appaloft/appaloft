import {
  CreatedAt,
  domainError,
  err,
  ok,
  ResourceByIdSpec,
  ResourceId,
  ResourceStorageAttachmentId,
  ResourceStorageMountModeValue,
  type Result,
  StorageDestinationPath,
  StorageVolumeByIdSpec,
  StorageVolumeId,
  safeTry,
  UpsertResourceSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type EventBus,
  type IdGenerator,
  type ResourceRepository,
  type StorageVolumeRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type AttachResourceStorageCommandInput } from "./attach-resource-storage.command";

@injectable()
export class AttachResourceStorageUseCase {
  constructor(
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
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
  ) {}

  async execute(
    context: ExecutionContext,
    input: AttachResourceStorageCommandInput,
  ): Promise<Result<{ id: string }>> {
    const repositoryContext = toRepositoryContext(context);
    const { clock, eventBus, idGenerator, logger, resourceRepository, storageVolumeRepository } =
      this;

    return safeTry(async function* () {
      const resourceId = yield* ResourceId.create(input.resourceId);
      const storageVolumeId = yield* StorageVolumeId.create(input.storageVolumeId);
      const destinationPath = yield* StorageDestinationPath.create(input.destinationPath);
      const mountMode = yield* ResourceStorageMountModeValue.create(input.mountMode);
      const attachedAt = yield* CreatedAt.create(clock.now());

      const resource = await resourceRepository.findOne(
        repositoryContext,
        ResourceByIdSpec.create(resourceId),
      );
      if (!resource) {
        return err(domainError.notFound("resource", resourceId.value));
      }

      const storageVolume = await storageVolumeRepository.findOne(
        repositoryContext,
        StorageVolumeByIdSpec.create(storageVolumeId),
      );
      if (!storageVolume) {
        return err(domainError.notFound("storage_volume", storageVolumeId.value));
      }

      const resourceState = resource.toState();
      const storageState = storageVolume.toState();
      if (
        !resourceState.projectId.equals(storageState.projectId) ||
        !resourceState.environmentId.equals(storageState.environmentId)
      ) {
        return err(
          domainError.resourceContextMismatch(
            "Storage volume does not belong to the resource context",
            {
              phase: "resource-storage-attachment",
              resourceId: resourceId.value,
              storageVolumeId: storageVolumeId.value,
              projectId: resourceState.projectId.value,
              environmentId: resourceState.environmentId.value,
            },
          ),
        );
      }

      yield* storageVolume.ensureActive();
      const attachmentId = ResourceStorageAttachmentId.rehydrate(idGenerator.next("rsa"));
      yield* resource.attachStorage({
        attachmentId,
        storageVolumeId,
        destinationPath,
        mountMode,
        attachedAt,
      });

      await resourceRepository.upsert(
        repositoryContext,
        resource,
        UpsertResourceSpec.fromResource(resource),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, resource, undefined);

      return ok({ id: attachmentId.value });
    });
  }
}
