import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type EnvironmentDuplicatePlanSummary } from "../../ports";
import { tokens } from "../../tokens";
import { PlanDuplicateEnvironmentQuery } from "./plan-duplicate-environment.query";
import { type PlanDuplicateEnvironmentQueryService } from "./plan-duplicate-environment.query-service";

@QueryHandler(PlanDuplicateEnvironmentQuery)
@injectable()
export class PlanDuplicateEnvironmentQueryHandler
  implements QueryHandlerContract<PlanDuplicateEnvironmentQuery, EnvironmentDuplicatePlanSummary>
{
  constructor(
    @inject(tokens.planDuplicateEnvironmentQueryService)
    private readonly queryService: PlanDuplicateEnvironmentQueryService,
  ) {}

  handle(context: ExecutionContext, query: PlanDuplicateEnvironmentQuery) {
    return this.queryService.execute(context, {
      environmentId: query.environmentId,
      targetName: query.targetName,
      ...(query.targetProjectId ? { targetProjectId: query.targetProjectId } : {}),
      ...(query.targetEnvironmentId ? { targetEnvironmentId: query.targetEnvironmentId } : {}),
    });
  }
}
