import {
  domainError,
  err,
  ok,
  type Result,
  StorageVolumeByEnvironmentAndSlugSpec,
  StorageVolumeByIdSpec,
  StorageVolumeId,
  StorageVolumeName,
  StorageVolumeSlug,
  safeTry,
  UpdatedAt,
  UpsertStorageVolumeSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type EventBus,
  type StorageVolumeRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type RenameStorageVolumeCommandInput } from "./rename-storage-volume.command";

@injectable()
export class RenameStorageVolumeUseCase {
  constructor(
    @inject(tokens.storageVolumeRepository)
    private readonly storageVolumeRepository: StorageVolumeRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: RenameStorageVolumeCommandInput,
  ): Promise<Result<{ id: string }>> {
    const repositoryContext = toRepositoryContext(context);
    const { clock, eventBus, logger, storageVolumeRepository } = this;

    return safeTry(async function* () {
      const storageVolumeId = yield* StorageVolumeId.create(input.storageVolumeId);
      const name = yield* StorageVolumeName.create(input.name);
      const renamedAt = yield* UpdatedAt.create(clock.now());
      const storageVolume = await storageVolumeRepository.findOne(
        repositoryContext,
        StorageVolumeByIdSpec.create(storageVolumeId),
      );
      if (!storageVolume) {
        return err(domainError.notFound("storage_volume", storageVolumeId.value));
      }
      yield* storageVolume.ensureActive();
      const nextSlug = yield* StorageVolumeSlug.fromName(name);
      const state = storageVolume.toState();
      const existing = await storageVolumeRepository.findOne(
        repositoryContext,
        StorageVolumeByEnvironmentAndSlugSpec.create(
          state.projectId,
          state.environmentId,
          nextSlug,
        ),
      );
      if (
        existing &&
        !existing.id.equals(storageVolumeId) &&
        !existing.toState().lifecycleStatus.isDeleted()
      ) {
        return err(
          domainError.conflict("storage_volume_slug_conflict", {
            phase: "storage-volume-validation",
            storageVolumeId: storageVolumeId.value,
            slug: nextSlug.value,
          }),
        );
      }
      yield* storageVolume.rename({ name, renamedAt });
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
