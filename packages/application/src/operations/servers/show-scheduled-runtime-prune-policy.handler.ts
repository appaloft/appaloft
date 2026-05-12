import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { type ShowScheduledRuntimePrunePolicyResult } from "./scheduled-runtime-prune.service";
import { ShowScheduledRuntimePrunePolicyQuery } from "./show-scheduled-runtime-prune-policy.query";
import { type ShowScheduledRuntimePrunePolicyQueryService } from "./show-scheduled-runtime-prune-policy.query-service";

@QueryHandler(ShowScheduledRuntimePrunePolicyQuery)
@injectable()
export class ShowScheduledRuntimePrunePolicyQueryHandler
  implements
    QueryHandlerContract<
      ShowScheduledRuntimePrunePolicyQuery,
      ShowScheduledRuntimePrunePolicyResult
    >
{
  constructor(
    @inject(tokens.showScheduledRuntimePrunePolicyQueryService)
    private readonly queryService: ShowScheduledRuntimePrunePolicyQueryService,
  ) {}

  handle(context: ExecutionContext, query: ShowScheduledRuntimePrunePolicyQuery) {
    return this.queryService.execute(context, { policyId: query.policyId });
  }
}
