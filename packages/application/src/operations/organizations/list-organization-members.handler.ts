import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  ListOrganizationMembersQuery,
  type ListOrganizationMembersQueryResult,
} from "./list-organization-members.query";
import { type ListOrganizationMembersQueryService } from "./list-organization-members.query-service";

@QueryHandler(ListOrganizationMembersQuery)
@injectable()
export class ListOrganizationMembersQueryHandler
  implements QueryHandlerContract<ListOrganizationMembersQuery, ListOrganizationMembersQueryResult>
{
  constructor(
    @inject(tokens.listOrganizationMembersQueryService)
    private readonly queryService: ListOrganizationMembersQueryService,
  ) {}

  handle(context: ExecutionContext, query: ListOrganizationMembersQuery) {
    return this.queryService.execute(context, query);
  }
}
