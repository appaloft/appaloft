import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type AccountProfileSummary } from "../../ports";
import { tokens } from "../../tokens";
import { ShowAccountProfileQuery } from "./show-account-profile.query";
import { type ShowAccountProfileQueryService } from "./show-account-profile.query-service";

@QueryHandler(ShowAccountProfileQuery)
@injectable()
export class ShowAccountProfileQueryHandler
  implements QueryHandlerContract<ShowAccountProfileQuery, AccountProfileSummary>
{
  constructor(
    @inject(tokens.showAccountProfileQueryService)
    private readonly queryService: ShowAccountProfileQueryService,
  ) {}

  handle(context: ExecutionContext, _query: ShowAccountProfileQuery) {
    return this.queryService.execute(context);
  }
}
