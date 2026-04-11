import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type DeploymentLogSummary, type DeploymentReadModel } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class DeploymentLogsQueryService {
  constructor(
    @inject(tokens.deploymentReadModel) private readonly readModel: DeploymentReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    deploymentId: string,
  ): Promise<{ deploymentId: string; logs: DeploymentLogSummary[] }> {
    return {
      deploymentId,
      logs: await this.readModel.findLogs(toRepositoryContext(context), deploymentId),
    };
  }
}
