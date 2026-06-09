import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ShowStorageVolumeBackupResult } from "../../ports";
import { tokens } from "../../tokens";
import { ShowStorageVolumeBackupQuery } from "./show-storage-volume-backup.query";
import { type ShowStorageVolumeBackupQueryService } from "./show-storage-volume-backup.query-service";

@QueryHandler(ShowStorageVolumeBackupQuery)
@injectable()
export class ShowStorageVolumeBackupQueryHandler
  implements QueryHandlerContract<ShowStorageVolumeBackupQuery, ShowStorageVolumeBackupResult>
{
  constructor(
    @inject(tokens.showStorageVolumeBackupQueryService)
    private readonly queryService: ShowStorageVolumeBackupQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ShowStorageVolumeBackupQuery,
  ): Promise<Result<ShowStorageVolumeBackupResult>> {
    return this.queryService.execute(context, query);
  }
}
