import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { CreateStorageVolumeBackupPlanQuery } from "./create-storage-volume-backup-plan.query";
import { type CreateStorageVolumeBackupPlanQueryService } from "./create-storage-volume-backup-plan.query-service";
import { type StorageBackupPlan } from "./storage-volume-backup-contract";

@QueryHandler(CreateStorageVolumeBackupPlanQuery)
@injectable()
export class CreateStorageVolumeBackupPlanQueryHandler
  implements QueryHandlerContract<CreateStorageVolumeBackupPlanQuery, StorageBackupPlan>
{
  constructor(
    @inject(tokens.createStorageVolumeBackupPlanQueryService)
    private readonly queryService: CreateStorageVolumeBackupPlanQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: CreateStorageVolumeBackupPlanQuery,
  ): Promise<Result<StorageBackupPlan>> {
    return this.queryService.execute(context, query);
  }
}
