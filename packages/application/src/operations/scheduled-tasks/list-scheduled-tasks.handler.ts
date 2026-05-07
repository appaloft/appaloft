import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ListScheduledTasksResult } from "../../ports";
import { tokens } from "../../tokens";
import { ListScheduledTasksQuery } from "./list-scheduled-tasks.query";
import { type ListScheduledTasksQueryService } from "./list-scheduled-tasks.query-service";

@QueryHandler(ListScheduledTasksQuery)
@injectable()
export class ListScheduledTasksQueryHandler
  implements QueryHandlerContract<ListScheduledTasksQuery, ListScheduledTasksResult>
{
  constructor(
    @inject(tokens.listScheduledTasksQueryService)
    private readonly queryService: ListScheduledTasksQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ListScheduledTasksQuery,
  ): Promise<Result<ListScheduledTasksResult>> {
    return ok(
      await this.queryService.execute(context, {
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.environmentId ? { environmentId: query.environmentId } : {}),
        ...(query.resourceId ? { resourceId: query.resourceId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.limit !== undefined ? { limit: query.limit } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
      }),
    );
  }
}
