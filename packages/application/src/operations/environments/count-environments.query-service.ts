import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type EnvironmentReadModel } from "../../ports";
import { tokens } from "../../tokens";
import { type CountEnvironmentsQuery } from "./count-environments.query";

@injectable()
export class CountEnvironmentsQueryService {
  constructor(
    @inject(tokens.environmentReadModel) private readonly readModel: EnvironmentReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    query?: CountEnvironmentsQuery,
  ): Promise<{ count: number }> {
    return {
      count: await this.readModel.count(toRepositoryContext(context), {
        ...(query?.projectId ? { projectId: query.projectId } : {}),
      }),
    };
  }
}
