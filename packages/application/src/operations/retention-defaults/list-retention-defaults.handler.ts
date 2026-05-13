import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ListRetentionDefaultsQuery } from "./list-retention-defaults.query";
import { type ListRetentionDefaultsQueryService } from "./list-retention-defaults.query-service";
import { type ListRetentionDefaultsResult } from "./retention-defaults.service";

@QueryHandler(ListRetentionDefaultsQuery)
@injectable()
export class ListRetentionDefaultsQueryHandler
  implements QueryHandlerContract<ListRetentionDefaultsQuery, ListRetentionDefaultsResult>
{
  constructor(
    @inject(tokens.listRetentionDefaultsQueryService)
    private readonly queryService: ListRetentionDefaultsQueryService,
  ) {}

  handle(context: ExecutionContext, query: ListRetentionDefaultsQuery) {
    return this.queryService.execute(context, {
      ...(query.input.scope ? { scope: query.input.scope } : {}),
      ...(query.input.organizationId ? { organizationId: query.input.organizationId } : {}),
      ...(query.input.category ? { category: query.input.category } : {}),
      enabledOnly: query.input.enabledOnly,
    });
  }
}
