import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ShowStorageVolumeResult } from "../../ports";
import { tokens } from "../../tokens";
import { ShowStorageVolumeQuery } from "./show-storage-volume.query";
import { type ShowStorageVolumeQueryService } from "./show-storage-volume.query-service";

@QueryHandler(ShowStorageVolumeQuery)
@injectable()
export class ShowStorageVolumeQueryHandler
  implements QueryHandlerContract<ShowStorageVolumeQuery, ShowStorageVolumeResult>
{
  constructor(
    @inject(tokens.showStorageVolumeQueryService)
    private readonly queryService: ShowStorageVolumeQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ShowStorageVolumeQuery,
  ): Promise<Result<ShowStorageVolumeResult>> {
    return this.queryService.execute(context, query);
  }
}
