import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type DeployTokenSummary } from "../../ports";
import { tokens } from "../../tokens";
import { ShowDeployTokenQuery } from "./show-deploy-token.query";
import { type ShowDeployTokenQueryService } from "./show-deploy-token.query-service";

@QueryHandler(ShowDeployTokenQuery)
@injectable()
export class ShowDeployTokenQueryHandler
  implements QueryHandlerContract<ShowDeployTokenQuery, DeployTokenSummary>
{
  constructor(
    @inject(tokens.showDeployTokenQueryService)
    private readonly queryService: ShowDeployTokenQueryService,
  ) {}

  handle(context: ExecutionContext, query: ShowDeployTokenQuery) {
    return this.queryService.execute(context, query);
  }
}
