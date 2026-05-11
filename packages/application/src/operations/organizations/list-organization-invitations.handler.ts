import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  ListOrganizationInvitationsQuery,
  type ListOrganizationInvitationsQueryResult,
} from "./list-organization-invitations.query";
import { type ListOrganizationInvitationsQueryService } from "./list-organization-invitations.query-service";

@QueryHandler(ListOrganizationInvitationsQuery)
@injectable()
export class ListOrganizationInvitationsQueryHandler
  implements
    QueryHandlerContract<ListOrganizationInvitationsQuery, ListOrganizationInvitationsQueryResult>
{
  constructor(
    @inject(tokens.listOrganizationInvitationsQueryService)
    private readonly queryService: ListOrganizationInvitationsQueryService,
  ) {}

  handle(context: ExecutionContext, query: ListOrganizationInvitationsQuery) {
    return this.queryService.execute(context, query);
  }
}
