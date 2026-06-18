import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type DomainBindingDnsReadiness } from "../../ports";
import { tokens } from "../../tokens";
import { InspectDomainBindingDnsReadinessQuery } from "./inspect-domain-binding-dns-readiness.query";
import { type InspectDomainBindingDnsReadinessQueryService } from "./inspect-domain-binding-dns-readiness.query-service";

@QueryHandler(InspectDomainBindingDnsReadinessQuery)
@injectable()
export class InspectDomainBindingDnsReadinessQueryHandler
  implements QueryHandlerContract<InspectDomainBindingDnsReadinessQuery, DomainBindingDnsReadiness>
{
  constructor(
    @inject(tokens.inspectDomainBindingDnsReadinessQueryService)
    private readonly queryService: InspectDomainBindingDnsReadinessQueryService,
  ) {}

  handle(
    context: Parameters<InspectDomainBindingDnsReadinessQueryService["execute"]>[0],
    query: InspectDomainBindingDnsReadinessQuery,
  ): Promise<Result<DomainBindingDnsReadiness>> {
    return this.queryService.execute(context, query.input);
  }
}
