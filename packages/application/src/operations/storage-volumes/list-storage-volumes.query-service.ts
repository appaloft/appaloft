import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type ListStorageVolumesResult,
  type StorageVolumeReadModel,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ListStorageVolumesQuery } from "./list-storage-volumes.query";

@injectable()
export class ListStorageVolumesQueryService {
  constructor(
    @inject(tokens.storageVolumeReadModel)
    private readonly storageVolumeReadModel: StorageVolumeReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ListStorageVolumesQuery,
  ): Promise<Result<ListStorageVolumesResult>> {
    const items = await this.storageVolumeReadModel.list(toRepositoryContext(context), {
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.environmentId ? { environmentId: query.environmentId } : {}),
    });

    return ok({
      schemaVersion: "storage-volumes.list/v1",
      items,
      generatedAt: this.clock.now(),
    });
  }
}
