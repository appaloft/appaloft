import { inject, injectable } from "tsyringe";
import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type DeploymentProof } from "../../ports";
import { tokens } from "../../tokens";
import { DeploymentProofQuery } from "./deployment-proof.query";
import { type DeploymentProofQueryService } from "./deployment-proof.query-service";
@QueryHandler(DeploymentProofQuery)
@injectable()
export class DeploymentProofQueryHandler
  implements QueryHandlerContract<DeploymentProofQuery, DeploymentProof>
{
  constructor(
    @inject(tokens.deploymentProofQueryService)
    private readonly queryService: DeploymentProofQueryService,
  ) {}
  handle(context: ExecutionContext, query: DeploymentProofQuery) {
    return this.queryService.execute(context, query);
  }
}
