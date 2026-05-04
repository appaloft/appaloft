import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ListStorageVolumesResult } from "../../ports";
import { tokens } from "../../tokens";
import { ListStorageVolumesQuery } from "./list-storage-volumes.query";
import { type ListStorageVolumesQueryService } from "./list-storage-volumes.query-service";

@QueryHandler(ListStorageVolumesQuery)
@injectable()
export class ListStorageVolumesQueryHandler
  implements QueryHandlerContract<ListStorageVolumesQuery, ListStorageVolumesResult>
{
  constructor(
    @inject(tokens.listStorageVolumesQueryService)
    private readonly queryService: ListStorageVolumesQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ListStorageVolumesQuery,
  ): Promise<Result<ListStorageVolumesResult>> {
    return this.queryService.execute(context, query);
  }
}
