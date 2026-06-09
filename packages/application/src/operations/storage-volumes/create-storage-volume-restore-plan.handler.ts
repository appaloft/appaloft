import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type StorageVolumeRestorePlan } from "../../ports";
import { tokens } from "../../tokens";
import { CreateStorageVolumeRestorePlanQuery } from "./create-storage-volume-restore-plan.query";
import { type CreateStorageVolumeRestorePlanQueryService } from "./create-storage-volume-restore-plan.query-service";

@QueryHandler(CreateStorageVolumeRestorePlanQuery)
@injectable()
export class CreateStorageVolumeRestorePlanQueryHandler
  implements QueryHandlerContract<CreateStorageVolumeRestorePlanQuery, StorageVolumeRestorePlan>
{
  constructor(
    @inject(tokens.createStorageVolumeRestorePlanQueryService)
    private readonly queryService: CreateStorageVolumeRestorePlanQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: CreateStorageVolumeRestorePlanQuery,
  ): Promise<Result<StorageVolumeRestorePlan>> {
    return this.queryService.execute(context, query);
  }
}
