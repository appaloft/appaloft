import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type CurrentOrganizationContext } from "../../ports";
import { tokens } from "../../tokens";
import { GetCurrentOrganizationContextQuery } from "./get-current-organization-context.query";
import { type GetCurrentOrganizationContextQueryService } from "./get-current-organization-context.query-service";

@QueryHandler(GetCurrentOrganizationContextQuery)
@injectable()
export class GetCurrentOrganizationContextQueryHandler
  implements QueryHandlerContract<GetCurrentOrganizationContextQuery, CurrentOrganizationContext>
{
  constructor(
    @inject(tokens.getCurrentOrganizationContextQueryService)
    private readonly queryService: GetCurrentOrganizationContextQueryService,
  ) {}

  handle(context: ExecutionContext, _query: GetCurrentOrganizationContextQuery) {
    return this.queryService.execute(context);
  }
}
