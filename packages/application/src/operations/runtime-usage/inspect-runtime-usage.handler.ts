import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type RuntimeUsageInspection } from "../../ports";
import { tokens } from "../../tokens";
import { InspectRuntimeUsageQuery } from "./inspect-runtime-usage.query";
import { type RuntimeUsageInspectionQueryService } from "./inspect-runtime-usage.query-service";

@QueryHandler(InspectRuntimeUsageQuery)
@injectable()
export class InspectRuntimeUsageQueryHandler
  implements QueryHandlerContract<InspectRuntimeUsageQuery, RuntimeUsageInspection>
{
  constructor(
    @inject(tokens.runtimeUsageInspectionQueryService)
    private readonly queryService: RuntimeUsageInspectionQueryService,
  ) {}

  handle(context: ExecutionContext, query: InspectRuntimeUsageQuery) {
    return this.queryService.execute(context, query);
  }
}
