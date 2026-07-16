import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ControlPlaneSecretRotationPlan } from "../../ports";
import { tokens } from "../../tokens";
import { ControlPlaneSecretRotationPlanQuery } from "./control-plane-secret-rotation-plan.query";
import { type ControlPlaneSecretRotationPlanQueryService } from "./control-plane-secret-rotation-plan.query-service";

@QueryHandler(ControlPlaneSecretRotationPlanQuery)
@injectable()
export class ControlPlaneSecretRotationPlanQueryHandler
  implements
    QueryHandlerContract<ControlPlaneSecretRotationPlanQuery, ControlPlaneSecretRotationPlan>
{
  constructor(
    @inject(tokens.controlPlaneSecretRotationPlanQueryService)
    private readonly queryService: ControlPlaneSecretRotationPlanQueryService,
  ) {}

  handle(context: ExecutionContext, _query: ControlPlaneSecretRotationPlanQuery) {
    return this.queryService.execute(context);
  }
}
