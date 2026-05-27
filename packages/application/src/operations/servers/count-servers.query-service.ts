import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type ServerReadModel } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class CountServersQueryService {
  constructor(@inject(tokens.serverReadModel) private readonly readModel: ServerReadModel) {}

  async execute(context: ExecutionContext): Promise<{ count: number }> {
    return { count: await this.readModel.count(toRepositoryContext(context)) };
  }
}
