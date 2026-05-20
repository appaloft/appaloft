import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  ListUsageIntentRecordsQuery,
  type ListUsageIntentRecordsResponse,
} from "./list-usage-intent-records.query";
import { type ListUsageIntentRecordsQueryService } from "./list-usage-intent-records.query-service";

@QueryHandler(ListUsageIntentRecordsQuery)
@injectable()
export class ListUsageIntentRecordsQueryHandler
  implements QueryHandlerContract<ListUsageIntentRecordsQuery, ListUsageIntentRecordsResponse>
{
  constructor(
    @inject(tokens.listUsageIntentRecordsQueryService)
    private readonly service: ListUsageIntentRecordsQueryService,
  ) {}

  async handle(context: ExecutionContext, query: ListUsageIntentRecordsQuery) {
    return this.service.execute(context, query);
  }
}
