import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type RuntimeMonitoringSamplesWindow } from "../../ports";
import { tokens } from "../../tokens";
import { ListRuntimeMonitoringSamplesQuery } from "./list-runtime-monitoring-samples.query";
import { type RuntimeMonitoringSamplesQueryService } from "./list-runtime-monitoring-samples.query-service";

@QueryHandler(ListRuntimeMonitoringSamplesQuery)
@injectable()
export class ListRuntimeMonitoringSamplesQueryHandler
  implements QueryHandlerContract<ListRuntimeMonitoringSamplesQuery, RuntimeMonitoringSamplesWindow>
{
  constructor(
    @inject(tokens.listRuntimeMonitoringSamplesQueryService)
    private readonly queryService: RuntimeMonitoringSamplesQueryService,
  ) {}

  handle(context: ExecutionContext, query: ListRuntimeMonitoringSamplesQuery) {
    return this.queryService.execute(context, query);
  }
}
