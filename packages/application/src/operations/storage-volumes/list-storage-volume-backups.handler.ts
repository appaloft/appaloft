import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ListStorageVolumeBackupsResult } from "../../ports";
import { tokens } from "../../tokens";
import { ListStorageVolumeBackupsQuery } from "./list-storage-volume-backups.query";
import { type ListStorageVolumeBackupsQueryService } from "./list-storage-volume-backups.query-service";

@QueryHandler(ListStorageVolumeBackupsQuery)
@injectable()
export class ListStorageVolumeBackupsQueryHandler
  implements QueryHandlerContract<ListStorageVolumeBackupsQuery, ListStorageVolumeBackupsResult>
{
  constructor(
    @inject(tokens.listStorageVolumeBackupsQueryService)
    private readonly queryService: ListStorageVolumeBackupsQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ListStorageVolumeBackupsQuery,
  ): Promise<Result<ListStorageVolumeBackupsResult>> {
    return this.queryService.execute(context, query);
  }
}
