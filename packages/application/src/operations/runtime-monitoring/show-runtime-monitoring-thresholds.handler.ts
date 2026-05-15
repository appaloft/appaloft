import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type RuntimeMonitoringThresholdsReadback } from "../../ports";
import { tokens } from "../../tokens";
import { type ShowRuntimeMonitoringThresholdsQueryService } from "./runtime-monitoring-thresholds.service";
import { ShowRuntimeMonitoringThresholdsQuery } from "./show-runtime-monitoring-thresholds.query";

@QueryHandler(ShowRuntimeMonitoringThresholdsQuery)
@injectable()
export class ShowRuntimeMonitoringThresholdsQueryHandler
  implements
    QueryHandlerContract<ShowRuntimeMonitoringThresholdsQuery, RuntimeMonitoringThresholdsReadback>
{
  constructor(
    @inject(tokens.showRuntimeMonitoringThresholdsQueryService)
    private readonly queryService: ShowRuntimeMonitoringThresholdsQueryService,
  ) {}

  handle(context: ExecutionContext, query: ShowRuntimeMonitoringThresholdsQuery) {
    return this.queryService.execute(context, query.input);
  }
}
