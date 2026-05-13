import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ResourceRuntimeLogArchiveShowResult } from "../../ports";
import { tokens } from "../../tokens";
import { ShowResourceRuntimeLogArchiveQuery } from "./show-resource-runtime-log-archive.query";
import { type ShowResourceRuntimeLogArchiveQueryService } from "./show-resource-runtime-log-archive.query-service";

@QueryHandler(ShowResourceRuntimeLogArchiveQuery)
@injectable()
export class ShowResourceRuntimeLogArchiveQueryHandler
  implements
    QueryHandlerContract<ShowResourceRuntimeLogArchiveQuery, ResourceRuntimeLogArchiveShowResult>
{
  constructor(
    @inject(tokens.showResourceRuntimeLogArchiveQueryService)
    private readonly queryService: ShowResourceRuntimeLogArchiveQueryService,
  ) {}

  handle(
    context: ExecutionContext,
    query: ShowResourceRuntimeLogArchiveQuery,
  ): Promise<Result<ResourceRuntimeLogArchiveShowResult>> {
    return this.queryService.execute(context, query);
  }
}
