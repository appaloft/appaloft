import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type ServerReadModel, type ServerSummary } from "../../ports";
import { tokens } from "../../tokens";
import { boundedListLimit, boundedListOffset } from "../shared-schema";
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
    items: ServerSummary[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const filter = query?.runtimeAvailability ?? "all";
    const repositoryContext = toRepositoryContext(context);
    const limit = boundedListLimit(query?.limit);
    const offset = boundedListOffset(query?.offset);
    const servers = await this.readModel.list(repositoryContext, {
      limit,
      offset,
    });
    const total = await this.readModel.count(repositoryContext);

    return {
      items: servers
        .map(withServerRuntimeAvailability)
        .filter((server) => serverMatchesRuntimeAvailabilityFilter(server, filter)),
      total,
      limit,
      offset,
    };
  }
}
