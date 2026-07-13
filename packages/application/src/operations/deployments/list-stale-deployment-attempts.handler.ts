import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type DeploymentStaleAttemptsResult } from "../../ports";
import { tokens } from "../../tokens";
import { ListStaleDeploymentAttemptsQuery } from "./list-stale-deployment-attempts.query";
import { type ListStaleDeploymentAttemptsQueryService } from "./list-stale-deployment-attempts.query-service";

@QueryHandler(ListStaleDeploymentAttemptsQuery)
@injectable()
export class ListStaleDeploymentAttemptsQueryHandler
  implements QueryHandlerContract<ListStaleDeploymentAttemptsQuery, DeploymentStaleAttemptsResult>
{
  constructor(
    @inject(tokens.listStaleDeploymentAttemptsQueryService)
    private readonly queryService: ListStaleDeploymentAttemptsQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ListStaleDeploymentAttemptsQuery,
  ): Promise<Result<DeploymentStaleAttemptsResult>> {
    return ok(await this.queryService.execute(context, query));
  }
}
