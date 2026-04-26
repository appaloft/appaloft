import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ListDefaultAccessDomainPoliciesResult } from "../../ports";
import { tokens } from "../../tokens";
import { ListDefaultAccessDomainPoliciesQuery } from "./list-default-access-domain-policies.query";
import { type ListDefaultAccessDomainPoliciesQueryService } from "./list-default-access-domain-policies.query-service";

@QueryHandler(ListDefaultAccessDomainPoliciesQuery)
@injectable()
export class ListDefaultAccessDomainPoliciesQueryHandler
  implements
    QueryHandlerContract<
      ListDefaultAccessDomainPoliciesQuery,
      ListDefaultAccessDomainPoliciesResult
    >
{
  constructor(
    @inject(tokens.listDefaultAccessDomainPoliciesQueryService)
    private readonly queryService: ListDefaultAccessDomainPoliciesQueryService,
  ) {}

  handle(_context: ExecutionContext, _query: ListDefaultAccessDomainPoliciesQuery) {
    return this.queryService.execute();
  }
}
