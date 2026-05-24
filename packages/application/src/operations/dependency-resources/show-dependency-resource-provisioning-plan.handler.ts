import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { type DependencyResourceProvisioningPlanResponse } from "./dependency-resource-provisioning.schema";
import { ShowDependencyResourceProvisioningPlanQuery } from "./show-dependency-resource-provisioning-plan.query";
import { type ShowDependencyResourceProvisioningPlanQueryService } from "./show-dependency-resource-provisioning-plan.query-service";

@QueryHandler(ShowDependencyResourceProvisioningPlanQuery)
@injectable()
export class ShowDependencyResourceProvisioningPlanQueryHandler
  implements
    QueryHandlerContract<
      ShowDependencyResourceProvisioningPlanQuery,
      DependencyResourceProvisioningPlanResponse
    >
{
  constructor(
    @inject(tokens.showDependencyResourceProvisioningPlanQueryService)
    private readonly queryService: ShowDependencyResourceProvisioningPlanQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ShowDependencyResourceProvisioningPlanQuery,
  ): Promise<Result<DependencyResourceProvisioningPlanResponse>> {
    return this.queryService.execute(context, query);
  }
}
