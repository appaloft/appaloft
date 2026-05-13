import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ListScheduledRuntimePrunePoliciesQuery } from "./list-scheduled-runtime-prune-policies.query";
import { type ListScheduledRuntimePrunePoliciesQueryService } from "./list-scheduled-runtime-prune-policies.query-service";
import { type ListScheduledRuntimePrunePoliciesResult } from "./scheduled-runtime-prune.service";

@QueryHandler(ListScheduledRuntimePrunePoliciesQuery)
@injectable()
export class ListScheduledRuntimePrunePoliciesQueryHandler
  implements
    QueryHandlerContract<
      ListScheduledRuntimePrunePoliciesQuery,
      ListScheduledRuntimePrunePoliciesResult
    >
{
  constructor(
    @inject(tokens.listScheduledRuntimePrunePoliciesQueryService)
    private readonly queryService: ListScheduledRuntimePrunePoliciesQueryService,
  ) {}

  handle(context: ExecutionContext, query: ListScheduledRuntimePrunePoliciesQuery) {
    return this.queryService.execute(context, {
      ...(query.serverId ? { serverId: query.serverId } : {}),
      ...(query.scope ? { scopes: [query.scope] } : {}),
      enabledOnly: query.enabledOnly,
    });
  }
}
