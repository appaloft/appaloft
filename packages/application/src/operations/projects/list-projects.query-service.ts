import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type ProjectReadModel } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class ListProjectsQueryService {
  constructor(@inject(tokens.projectReadModel) private readonly readModel: ProjectReadModel) {}

  async execute(context: ExecutionContext): Promise<{
    items: Awaited<ReturnType<ProjectReadModel["list"]>>;
  }> {
    return { items: await this.readModel.list(toRepositoryContext(context)) };
  }
}
