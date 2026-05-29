import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type OrganizationProfileSummary } from "../../ports";
import { tokens } from "../../tokens";
import { ShowOrganizationProfileQuery } from "./show-organization-profile.query";
import { type ShowOrganizationProfileQueryService } from "./show-organization-profile.query-service";

@QueryHandler(ShowOrganizationProfileQuery)
@injectable()
export class ShowOrganizationProfileQueryHandler
  implements QueryHandlerContract<ShowOrganizationProfileQuery, OrganizationProfileSummary>
{
  constructor(
    @inject(tokens.showOrganizationProfileQueryService)
    private readonly queryService: ShowOrganizationProfileQueryService,
  ) {}

  handle(context: ExecutionContext, query: ShowOrganizationProfileQuery) {
    return this.queryService.execute(context, query);
  }
}
