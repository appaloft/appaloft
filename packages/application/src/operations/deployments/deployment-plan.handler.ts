import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type DeploymentPlanPreview } from "../../ports";
import { tokens } from "../../tokens";
import { DeploymentPlanQuery } from "./deployment-plan.query";
import { type DeploymentPlanQueryService } from "./deployment-plan.query-service";

@QueryHandler(DeploymentPlanQuery)
@injectable()
export class DeploymentPlanQueryHandler
  implements QueryHandlerContract<DeploymentPlanQuery, DeploymentPlanPreview>
{
  constructor(
    @inject(tokens.deploymentPlanQueryService)
    private readonly queryService: DeploymentPlanQueryService,
  ) {}

  handle(context: ExecutionContext, query: DeploymentPlanQuery) {
    return this.queryService.execute(context, query);
  }
}
