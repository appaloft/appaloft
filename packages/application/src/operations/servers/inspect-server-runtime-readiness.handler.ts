import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type RuntimeTargetReadinessInspection } from "../../ports";
import { tokens } from "../../tokens";
import { InspectServerRuntimeReadinessQuery } from "./inspect-server-runtime-readiness.query";
import { type InspectServerRuntimeReadinessQueryService } from "./inspect-server-runtime-readiness.query-service";

@QueryHandler(InspectServerRuntimeReadinessQuery)
@injectable()
export class InspectServerRuntimeReadinessQueryHandler
  implements
    QueryHandlerContract<InspectServerRuntimeReadinessQuery, RuntimeTargetReadinessInspection>
{
  constructor(
    @inject(tokens.inspectServerRuntimeReadinessQueryService)
    private readonly queryService: InspectServerRuntimeReadinessQueryService,
  ) {}

  handle(context: ExecutionContext, query: InspectServerRuntimeReadinessQuery) {
    return this.queryService.execute(context, query);
  }
}
