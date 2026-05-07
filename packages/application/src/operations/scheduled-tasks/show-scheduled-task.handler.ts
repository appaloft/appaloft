import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ShowScheduledTaskResult } from "../../ports";
import { tokens } from "../../tokens";
import { ShowScheduledTaskQuery } from "./show-scheduled-task.query";
import { type ShowScheduledTaskQueryService } from "./show-scheduled-task.query-service";

@QueryHandler(ShowScheduledTaskQuery)
@injectable()
export class ShowScheduledTaskQueryHandler
  implements QueryHandlerContract<ShowScheduledTaskQuery, ShowScheduledTaskResult>
{
  constructor(
    @inject(tokens.showScheduledTaskQueryService)
    private readonly queryService: ShowScheduledTaskQueryService,
  ) {}

  handle(context: ExecutionContext, query: ShowScheduledTaskQuery) {
    return this.queryService.execute(context, {
      taskId: query.taskId,
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
    });
  }
}
