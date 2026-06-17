import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ConnectorCapabilityPlanPreview } from "../../ports";
import { tokens } from "../../tokens";
import { PlanDomainBindingDnsQuery } from "./plan-domain-binding-dns.query";
import { type PlanDomainBindingDnsQueryService } from "./plan-domain-binding-dns.query-service";

@QueryHandler(PlanDomainBindingDnsQuery)
@injectable()
export class PlanDomainBindingDnsQueryHandler
  implements QueryHandlerContract<PlanDomainBindingDnsQuery, ConnectorCapabilityPlanPreview>
{
  constructor(
    @inject(tokens.planDomainBindingDnsQueryService)
    private readonly queryService: PlanDomainBindingDnsQueryService,
  ) {}

  handle(
    context: ExecutionContext,
    query: PlanDomainBindingDnsQuery,
  ): ReturnType<PlanDomainBindingDnsQueryService["execute"]> {
    return this.queryService.execute(context, query.input);
  }
}
