import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type DeploymentDetail } from "../../ports";
import { tokens } from "../../tokens";
import { ShowDeploymentQuery } from "./show-deployment.query";
import { type ShowDeploymentQueryService } from "./show-deployment.query-service";

@QueryHandler(ShowDeploymentQuery)
@injectable()
export class ShowDeploymentQueryHandler
  implements QueryHandlerContract<ShowDeploymentQuery, DeploymentDetail>
{
  constructor(
    @inject(tokens.showDeploymentQueryService)
    private readonly queryService: ShowDeploymentQueryService,
  ) {}

  handle(context: ExecutionContext, query: ShowDeploymentQuery) {
    return this.queryService.execute(context, query);
  }
}
