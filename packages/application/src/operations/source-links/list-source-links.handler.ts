import { inject, injectable } from "tsyringe";
import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ListSourceLinksQuery, type ListSourceLinksResult } from "./list-source-links.query";
import { type SourceLinkQueryService } from "./source-link.query-service";

@injectable()
@QueryHandler(ListSourceLinksQuery)
export class ListSourceLinksQueryHandler
  implements QueryHandlerContract<ListSourceLinksQuery, ListSourceLinksResult>
{
  constructor(
    @inject(tokens.sourceLinkQueryService)
    private readonly queryService: SourceLinkQueryService,
  ) {}

  handle(context: ExecutionContext, query: ListSourceLinksQuery) {
    return this.queryService.list(context, query);
  }
}
