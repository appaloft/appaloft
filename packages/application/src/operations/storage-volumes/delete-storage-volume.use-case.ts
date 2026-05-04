import {
  DeletedAt,
  domainError,
  err,
  ok,
  type Result,
  StorageVolumeByIdSpec,
  StorageVolumeId,
  safeTry,
  UpsertStorageVolumeSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type EventBus,
  type StorageVolumeReadModel,
  type StorageVolumeRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type DeleteStorageVolumeCommandInput } from "./delete-storage-volume.command";

@injectable()
export class DeleteStorageVolumeUseCase {
  constructor(
    @inject(tokens.storageVolumeRepository)
    private readonly storageVolumeRepository: StorageVolumeRepository,
    @inject(tokens.storageVolumeReadModel)
    private readonly storageVolumeReadModel: StorageVolumeReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: DeleteStorageVolumeCommandInput,
  ): Promise<Result<{ id: string }>> {
    const repositoryContext = toRepositoryContext(context);
    const { clock, eventBus, logger, storageVolumeReadModel, storageVolumeRepository } = this;

    return safeTry(async function* () {
      const storageVolumeId = yield* StorageVolumeId.create(input.storageVolumeId);
      const deletedAt = yield* DeletedAt.create(clock.now());
      const storageVolume = await storageVolumeRepository.findOne(
        repositoryContext,
        StorageVolumeByIdSpec.create(storageVolumeId),
      );
      if (!storageVolume) {
        return err(domainError.notFound("storage_volume", storageVolumeId.value));
      }
      const attachmentCount = await storageVolumeReadModel.countAttachments(
        repositoryContext,
        storageVolumeId.value,
      );
      yield* storageVolume.delete({ deletedAt, attachmentCount });
      await storageVolumeRepository.upsert(
        repositoryContext,
        storageVolume,
        UpsertStorageVolumeSpec.fromStorageVolume(storageVolume),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, storageVolume, undefined);
      return ok({ id: storageVolumeId.value });
    });
  }
}
