import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type RuntimeMonitoringRollup } from "../../ports";
import { tokens } from "../../tokens";
import { RuntimeMonitoringRollupQuery } from "./runtime-monitoring-rollup.query";
import { type RuntimeMonitoringRollupQueryService } from "./runtime-monitoring-rollup.query-service";

@QueryHandler(RuntimeMonitoringRollupQuery)
@injectable()
export class RuntimeMonitoringRollupQueryHandler
  implements QueryHandlerContract<RuntimeMonitoringRollupQuery, RuntimeMonitoringRollup>
{
  constructor(
    @inject(tokens.runtimeMonitoringRollupQueryService)
    private readonly queryService: RuntimeMonitoringRollupQueryService,
  ) {}

  handle(context: ExecutionContext, query: RuntimeMonitoringRollupQuery) {
    return this.queryService.execute(context, query);
  }
}
