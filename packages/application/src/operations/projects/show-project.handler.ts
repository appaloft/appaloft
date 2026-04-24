import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ProjectSummary } from "../../ports";
import { tokens } from "../../tokens";
import { ShowProjectQuery } from "./show-project.query";
import { type ShowProjectQueryService } from "./show-project.query-service";

@QueryHandler(ShowProjectQuery)
@injectable()
export class ShowProjectQueryHandler
  implements QueryHandlerContract<ShowProjectQuery, ProjectSummary>
{
  constructor(
    @inject(tokens.showProjectQueryService)
    private readonly queryService: ShowProjectQueryService,
  ) {}

  handle(context: ExecutionContext, query: ShowProjectQuery) {
    return this.queryService.execute(context, query);
  }
}
