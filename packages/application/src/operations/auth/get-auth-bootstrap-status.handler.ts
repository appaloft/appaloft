import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type AuthBootstrapStatus } from "../../ports";
import { tokens } from "../../tokens";
import { GetAuthBootstrapStatusQuery } from "./get-auth-bootstrap-status.query";
import { type GetAuthBootstrapStatusQueryService } from "./get-auth-bootstrap-status.query-service";

@QueryHandler(GetAuthBootstrapStatusQuery)
@injectable()
export class GetAuthBootstrapStatusQueryHandler
  implements QueryHandlerContract<GetAuthBootstrapStatusQuery, AuthBootstrapStatus>
{
  constructor(
    @inject(tokens.getAuthBootstrapStatusQueryService)
    private readonly queryService: GetAuthBootstrapStatusQueryService,
  ) {}

  handle(context: ExecutionContext, _query: GetAuthBootstrapStatusQuery) {
    return this.queryService.execute(context);
  }
}
