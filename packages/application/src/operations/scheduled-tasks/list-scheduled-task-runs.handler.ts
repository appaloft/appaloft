import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ListScheduledTaskRunsResult } from "../../ports";
import { tokens } from "../../tokens";
import { ListScheduledTaskRunsQuery } from "./list-scheduled-task-runs.query";
import { type ListScheduledTaskRunsQueryService } from "./list-scheduled-task-runs.query-service";

@QueryHandler(ListScheduledTaskRunsQuery)
@injectable()
export class ListScheduledTaskRunsQueryHandler
  implements QueryHandlerContract<ListScheduledTaskRunsQuery, ListScheduledTaskRunsResult>
{
  constructor(
    @inject(tokens.listScheduledTaskRunsQueryService)
    private readonly queryService: ListScheduledTaskRunsQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ListScheduledTaskRunsQuery,
  ): Promise<Result<ListScheduledTaskRunsResult>> {
    return ok(
      await this.queryService.execute(context, {
        ...(query.taskId ? { taskId: query.taskId } : {}),
        ...(query.resourceId ? { resourceId: query.resourceId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.triggerKind ? { triggerKind: query.triggerKind } : {}),
        ...(query.limit !== undefined ? { limit: query.limit } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
      }),
    );
  }
}
