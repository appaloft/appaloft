import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type DeploymentReadModel } from "../../ports";
import { tokens } from "../../tokens";
import { boundedListLimit } from "../shared-schema";
import { maskDeploymentSummarySecrets } from "./deployment-summary-redaction";

@injectable()
export class ListDeploymentsQueryService {
  constructor(
    @inject(tokens.deploymentReadModel) private readonly readModel: DeploymentReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    input?: {
      projectId?: string;
      resourceId?: string;
      includeArchived?: boolean;
      activeResourcesOnly?: boolean;
      limit?: number;
    },
  ): Promise<{ items: Awaited<ReturnType<DeploymentReadModel["list"]>> }> {
    const items = await this.readModel.list(toRepositoryContext(context), {
      ...(input?.projectId ? { projectId: input.projectId } : {}),
      ...(input?.resourceId ? { resourceId: input.resourceId } : {}),
      ...(input?.includeArchived !== undefined ? { includeArchived: input.includeArchived } : {}),
      ...(input?.activeResourcesOnly !== undefined
        ? { activeResourcesOnly: input.activeResourcesOnly }
        : {}),
      limit: boundedListLimit(input?.limit),
    });

    return {
      items: items.map(maskDeploymentSummarySecrets),
    };
  }
}
