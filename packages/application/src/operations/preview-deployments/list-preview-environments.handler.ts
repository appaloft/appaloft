import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ListPreviewEnvironmentsResult } from "../../ports";
import { tokens } from "../../tokens";
import { ListPreviewEnvironmentsQuery } from "./list-preview-environments.query";
import { type ListPreviewEnvironmentsQueryService } from "./list-preview-environments.query-service";

@QueryHandler(ListPreviewEnvironmentsQuery)
@injectable()
export class ListPreviewEnvironmentsQueryHandler
  implements QueryHandlerContract<ListPreviewEnvironmentsQuery, ListPreviewEnvironmentsResult>
{
  constructor(
    @inject(tokens.listPreviewEnvironmentsQueryService)
    private readonly queryService: ListPreviewEnvironmentsQueryService,
  ) {}

  handle(context: ExecutionContext, query: ListPreviewEnvironmentsQuery) {
    return this.queryService.execute(context, query);
  }
}
