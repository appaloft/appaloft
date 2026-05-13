import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { type ShowRetentionDefaultResult } from "./retention-defaults.service";
import { ShowRetentionDefaultQuery } from "./show-retention-default.query";
import { type ShowRetentionDefaultQueryService } from "./show-retention-default.query-service";

@QueryHandler(ShowRetentionDefaultQuery)
@injectable()
export class ShowRetentionDefaultQueryHandler
  implements QueryHandlerContract<ShowRetentionDefaultQuery, ShowRetentionDefaultResult>
{
  constructor(
    @inject(tokens.showRetentionDefaultQueryService)
    private readonly queryService: ShowRetentionDefaultQueryService,
  ) {}

  handle(context: ExecutionContext, query: ShowRetentionDefaultQuery) {
    return this.queryService.execute(context, {
      scope: query.input.scope,
      ...(query.input.organizationId ? { organizationId: query.input.organizationId } : {}),
      category: query.input.category,
    });
  }
}
