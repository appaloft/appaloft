import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type ServerReadModel } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class ListServersQueryService {
  constructor(@inject(tokens.serverReadModel) private readonly readModel: ServerReadModel) {}

  async execute(context: ExecutionContext): Promise<{
    items: Awaited<ReturnType<ServerReadModel["list"]>>;
  }> {
    return { items: await this.readModel.list(toRepositoryContext(context)) };
  }
}
