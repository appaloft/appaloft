import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ResourceRuntimeLogArchiveListResult } from "../../ports";
import { tokens } from "../../tokens";
import { ListResourceRuntimeLogArchivesQuery } from "./list-resource-runtime-log-archives.query";
import { type ListResourceRuntimeLogArchivesQueryService } from "./list-resource-runtime-log-archives.query-service";

@QueryHandler(ListResourceRuntimeLogArchivesQuery)
@injectable()
export class ListResourceRuntimeLogArchivesQueryHandler
  implements
    QueryHandlerContract<ListResourceRuntimeLogArchivesQuery, ResourceRuntimeLogArchiveListResult>
{
  constructor(
    @inject(tokens.listResourceRuntimeLogArchivesQueryService)
    private readonly queryService: ListResourceRuntimeLogArchivesQueryService,
  ) {}

  handle(
    context: ExecutionContext,
    query: ListResourceRuntimeLogArchivesQuery,
  ): Promise<Result<ResourceRuntimeLogArchiveListResult>> {
    return this.queryService.execute(context, query);
  }
}
