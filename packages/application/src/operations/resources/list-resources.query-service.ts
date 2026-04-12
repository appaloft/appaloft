import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type ResourceReadModel } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class ListResourcesQueryService {
  constructor(@inject(tokens.resourceReadModel) private readonly readModel: ResourceReadModel) {}

  async execute(
    context: ExecutionContext,
    input?: {
      projectId?: string;
      environmentId?: string;
    },
  ): Promise<{ items: Awaited<ReturnType<ResourceReadModel["list"]>> }> {
    return { items: await this.readModel.list(toRepositoryContext(context), input) };
  }
}
