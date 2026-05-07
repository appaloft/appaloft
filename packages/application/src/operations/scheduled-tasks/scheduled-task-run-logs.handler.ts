import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ScheduledTaskRunLogsResult } from "../../ports";
import { tokens } from "../../tokens";
import { ScheduledTaskRunLogsQuery } from "./scheduled-task-run-logs.query";
import { type ScheduledTaskRunLogsQueryService } from "./scheduled-task-run-logs.query-service";

@QueryHandler(ScheduledTaskRunLogsQuery)
@injectable()
export class ScheduledTaskRunLogsQueryHandler
  implements QueryHandlerContract<ScheduledTaskRunLogsQuery, ScheduledTaskRunLogsResult>
{
  constructor(
    @inject(tokens.scheduledTaskRunLogsQueryService)
    private readonly queryService: ScheduledTaskRunLogsQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ScheduledTaskRunLogsQuery,
  ): Promise<Result<ScheduledTaskRunLogsResult>> {
    return ok(
      await this.queryService.execute(context, {
        runId: query.runId,
        ...(query.taskId ? { taskId: query.taskId } : {}),
        ...(query.resourceId ? { resourceId: query.resourceId } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
        ...(query.limit !== undefined ? { limit: query.limit } : {}),
      }),
    );
  }
}
