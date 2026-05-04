import {
  domainError,
  err,
  ok,
  type Result,
  StorageVolumeByIdSpec,
  StorageVolumeId,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type Clock, type ShowStorageVolumeResult, type StorageVolumeReadModel } from "../../ports";
import { tokens } from "../../tokens";
import { type ShowStorageVolumeQuery } from "./show-storage-volume.query";

@injectable()
export class ShowStorageVolumeQueryService {
  constructor(
    @inject(tokens.storageVolumeReadModel)
    private readonly storageVolumeReadModel: StorageVolumeReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ShowStorageVolumeQuery,
  ): Promise<Result<ShowStorageVolumeResult>> {
    const storageVolumeId = StorageVolumeId.create(query.storageVolumeId);
    if (storageVolumeId.isErr()) {
      return err(storageVolumeId.error);
    }
    const storageVolume = await this.storageVolumeReadModel.findOne(
      toRepositoryContext(context),
      StorageVolumeByIdSpec.create(storageVolumeId.value),
    );
    if (!storageVolume) {
      return err(domainError.notFound("storage_volume", query.storageVolumeId));
    }
    return ok({
      schemaVersion: "storage-volumes.show/v1",
      storageVolume,
      generatedAt: this.clock.now(),
    });
  }
}
