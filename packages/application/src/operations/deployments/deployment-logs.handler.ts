import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type DeploymentLogSummary } from "../../ports";
import { tokens } from "../../tokens";
import { DeploymentLogsQuery } from "./deployment-logs.query";
import { type DeploymentLogsQueryService } from "./deployment-logs.query-service";

@QueryHandler(DeploymentLogsQuery)
@injectable()
export class DeploymentLogsQueryHandler
  implements
    QueryHandlerContract<
      DeploymentLogsQuery,
      { deploymentId: string; logs: DeploymentLogSummary[] }
    >
{
  constructor(
    @inject(tokens.logsQueryService)
    private readonly queryService: DeploymentLogsQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: DeploymentLogsQuery,
  ): Promise<Result<{ deploymentId: string; logs: DeploymentLogSummary[] }>> {
    return ok(await this.queryService.execute(context, query.deploymentId));
  }
}
