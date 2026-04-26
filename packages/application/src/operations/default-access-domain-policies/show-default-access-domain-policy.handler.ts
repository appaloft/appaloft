import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ShowDefaultAccessDomainPolicyResult } from "../../ports";
import { tokens } from "../../tokens";
import { ShowDefaultAccessDomainPolicyQuery } from "./show-default-access-domain-policy.query";
import { type ShowDefaultAccessDomainPolicyQueryService } from "./show-default-access-domain-policy.query-service";

@QueryHandler(ShowDefaultAccessDomainPolicyQuery)
@injectable()
export class ShowDefaultAccessDomainPolicyQueryHandler
  implements
    QueryHandlerContract<ShowDefaultAccessDomainPolicyQuery, ShowDefaultAccessDomainPolicyResult>
{
  constructor(
    @inject(tokens.showDefaultAccessDomainPolicyQueryService)
    private readonly queryService: ShowDefaultAccessDomainPolicyQueryService,
  ) {}

  handle(context: ExecutionContext, query: ShowDefaultAccessDomainPolicyQuery) {
    return this.queryService.execute(context, {
      scopeKind: query.scopeKind,
      ...(query.serverId ? { serverId: query.serverId } : {}),
    });
  }
}
