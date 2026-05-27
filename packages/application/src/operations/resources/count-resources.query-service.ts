import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type ResourceReadModel } from "../../ports";
import { tokens } from "../../tokens";
import { type CountResourcesQuery } from "./count-resources.query";

@injectable()
export class CountResourcesQueryService {
  constructor(@inject(tokens.resourceReadModel) private readonly readModel: ResourceReadModel) {}

  async execute(
    context: ExecutionContext,
    query?: CountResourcesQuery,
  ): Promise<{ count: number }> {
    return {
      count: await this.readModel.count(toRepositoryContext(context), {
        ...(query?.projectId ? { projectId: query.projectId } : {}),
        ...(query?.environmentId ? { environmentId: query.environmentId } : {}),
        ...(query?.includePreviewResources !== undefined
          ? { includePreviewResources: query.includePreviewResources }
          : {}),
      }),
    };
  }
}
