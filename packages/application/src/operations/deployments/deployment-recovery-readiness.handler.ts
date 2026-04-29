import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type DeploymentRecoveryReadiness } from "../../ports";
import { tokens } from "../../tokens";
import { DeploymentRecoveryReadinessQuery } from "./deployment-recovery-readiness.query";
import { type DeploymentRecoveryReadinessQueryService } from "./deployment-recovery-readiness.query-service";

@QueryHandler(DeploymentRecoveryReadinessQuery)
@injectable()
export class DeploymentRecoveryReadinessQueryHandler
  implements QueryHandlerContract<DeploymentRecoveryReadinessQuery, DeploymentRecoveryReadiness>
{
  constructor(
    @inject(tokens.deploymentRecoveryReadinessQueryService)
    private readonly queryService: DeploymentRecoveryReadinessQueryService,
  ) {}

  handle(context: ExecutionContext, query: DeploymentRecoveryReadinessQuery) {
    return this.queryService.execute(context, query);
  }
}
