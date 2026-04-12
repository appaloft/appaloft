import { ok, type Result } from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ResourceSummary } from "../../ports";
import { tokens } from "../../tokens";
import { ListResourcesQuery } from "./list-resources.query";
import { type ListResourcesQueryService } from "./list-resources.query-service";

@QueryHandler(ListResourcesQuery)
@injectable()
export class ListResourcesQueryHandler
  implements QueryHandlerContract<ListResourcesQuery, { items: ResourceSummary[] }>
{
  constructor(
    @inject(tokens.listResourcesQueryService)
    private readonly queryService: ListResourcesQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ListResourcesQuery,
  ): Promise<Result<{ items: ResourceSummary[] }>> {
    return ok(
      await this.queryService.execute(
        context,
        query.projectId || query.environmentId
          ? {
              ...(query.projectId ? { projectId: query.projectId } : {}),
              ...(query.environmentId ? { environmentId: query.environmentId } : {}),
            }
          : undefined,
      ),
    );
  }
}
