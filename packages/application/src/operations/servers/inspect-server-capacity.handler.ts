import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type RuntimeTargetCapacityInspection } from "../../ports";
import { tokens } from "../../tokens";
import { InspectServerCapacityQuery } from "./inspect-server-capacity.query";
import { type InspectServerCapacityQueryService } from "./inspect-server-capacity.query-service";

@QueryHandler(InspectServerCapacityQuery)
@injectable()
export class InspectServerCapacityQueryHandler
  implements QueryHandlerContract<InspectServerCapacityQuery, RuntimeTargetCapacityInspection>
{
  constructor(
    @inject(tokens.inspectServerCapacityQueryService)
    private readonly queryService: InspectServerCapacityQueryService,
  ) {}

  handle(context: ExecutionContext, query: InspectServerCapacityQuery) {
    return this.queryService.execute(context, query);
  }
}
