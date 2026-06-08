import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type ServerReadModel } from "../../ports";
import { tokens } from "../../tokens";
import { boundedListLimit } from "../shared-schema";
import { type ListServersQuery } from "./list-servers.query";
import {
  serverMatchesRuntimeAvailabilityFilter,
  withServerRuntimeAvailability,
} from "./server-runtime-availability";

@injectable()
export class ListServersQueryService {
  constructor(@inject(tokens.serverReadModel) private readonly readModel: ServerReadModel) {}

  async execute(
    context: ExecutionContext,
    query?: ListServersQuery,
  ): Promise<{
    items: Awaited<ReturnType<ServerReadModel["list"]>>;
  }> {
    const filter = query?.runtimeAvailability ?? "all";
    const servers = await this.readModel.list(toRepositoryContext(context), {
      limit: boundedListLimit(query?.limit),
    });

    return {
      items: servers
        .map(withServerRuntimeAvailability)
        .filter((server) => serverMatchesRuntimeAvailabilityFilter(server, filter)),
    };
  }
}
