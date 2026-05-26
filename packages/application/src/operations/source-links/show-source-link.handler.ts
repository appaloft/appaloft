import { inject, injectable } from "tsyringe";
import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ShowSourceLinkQuery, type ShowSourceLinkResult } from "./show-source-link.query";
import { type SourceLinkQueryService } from "./source-link.query-service";

@injectable()
@QueryHandler(ShowSourceLinkQuery)
export class ShowSourceLinkQueryHandler
  implements QueryHandlerContract<ShowSourceLinkQuery, ShowSourceLinkResult>
{
  constructor(
    @inject(tokens.sourceLinkQueryService)
    private readonly queryService: SourceLinkQueryService,
  ) {}

  handle(context: ExecutionContext, query: ShowSourceLinkQuery) {
    return this.queryService.show(context, query);
  }
}
