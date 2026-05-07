import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ShowPreviewEnvironmentResult } from "../../ports";
import { tokens } from "../../tokens";
import { ShowPreviewEnvironmentQuery } from "./show-preview-environment.query";
import { type ShowPreviewEnvironmentQueryService } from "./show-preview-environment.query-service";

@QueryHandler(ShowPreviewEnvironmentQuery)
@injectable()
export class ShowPreviewEnvironmentQueryHandler
  implements QueryHandlerContract<ShowPreviewEnvironmentQuery, ShowPreviewEnvironmentResult>
{
  constructor(
    @inject(tokens.showPreviewEnvironmentQueryService)
    private readonly queryService: ShowPreviewEnvironmentQueryService,
  ) {}

  handle(context: ExecutionContext, query: ShowPreviewEnvironmentQuery) {
    return this.queryService.execute(context, query);
  }
}
