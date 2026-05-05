import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ShowScheduledTaskRunResult } from "../../ports";
import { tokens } from "../../tokens";
import { ShowScheduledTaskRunQuery } from "./show-scheduled-task-run.query";
import { type ShowScheduledTaskRunQueryService } from "./show-scheduled-task-run.query-service";

@QueryHandler(ShowScheduledTaskRunQuery)
@injectable()
export class ShowScheduledTaskRunQueryHandler
  implements QueryHandlerContract<ShowScheduledTaskRunQuery, ShowScheduledTaskRunResult>
{
  constructor(
    @inject(tokens.showScheduledTaskRunQueryService)
    private readonly queryService: ShowScheduledTaskRunQueryService,
  ) {}

  handle(context: ExecutionContext, query: ShowScheduledTaskRunQuery) {
    return this.queryService.execute(context, {
      runId: query.runId,
      ...(query.taskId ? { taskId: query.taskId } : {}),
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
    });
  }
}
