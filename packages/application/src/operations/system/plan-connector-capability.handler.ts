import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ConnectorCapabilityPlanPreview } from "../../ports";
import { tokens } from "../../tokens";
import { PlanConnectorCapabilityQuery } from "./plan-connector-capability.query";
import { type PlanConnectorCapabilityQueryService } from "./plan-connector-capability.query-service";

@QueryHandler(PlanConnectorCapabilityQuery)
@injectable()
export class PlanConnectorCapabilityQueryHandler
  implements QueryHandlerContract<PlanConnectorCapabilityQuery, ConnectorCapabilityPlanPreview>
{
  constructor(
    @inject(tokens.connectorCapabilityPlanQueryService)
    private readonly queryService: PlanConnectorCapabilityQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: PlanConnectorCapabilityQuery,
  ): ReturnType<PlanConnectorCapabilityQueryService["execute"]> {
    return this.queryService.execute(context, query.input);
  }
}
