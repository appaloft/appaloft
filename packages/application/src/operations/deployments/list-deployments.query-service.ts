import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type DeploymentReadModel } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class ListDeploymentsQueryService {
  constructor(
    @inject(tokens.deploymentReadModel) private readonly readModel: DeploymentReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    input?: {
      projectId?: string;
    },
  ): Promise<{ items: Awaited<ReturnType<DeploymentReadModel["list"]>> }> {
    return { items: await this.readModel.list(toRepositoryContext(context), input?.projectId) };
  }
}
