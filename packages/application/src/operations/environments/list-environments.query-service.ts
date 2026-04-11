import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type EnvironmentReadModel } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class ListEnvironmentsQueryService {
  constructor(
    @inject(tokens.environmentReadModel) private readonly readModel: EnvironmentReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    input?: {
      projectId?: string;
    },
  ): Promise<{ items: Awaited<ReturnType<EnvironmentReadModel["list"]>> }> {
    return { items: await this.readModel.list(toRepositoryContext(context), input?.projectId) };
  }
}
