import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type ServerReadModel } from "../../ports";
import { tokens } from "../../tokens";
import { boundedListLimit } from "../shared-schema";
import { type ListServersQuery } from "./list-servers.query";

@injectable()
export class ListServersQueryService {
  constructor(@inject(tokens.serverReadModel) private readonly readModel: ServerReadModel) {}

  async execute(
    context: ExecutionContext,
    query?: ListServersQuery,
  ): Promise<{
    items: Awaited<ReturnType<ServerReadModel["list"]>>;
  }> {
    return {
      items: await this.readModel.list(toRepositoryContext(context), {
        limit: boundedListLimit(query?.limit),
      }),
    };
  }
}
