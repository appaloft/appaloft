import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ServerDeleteSafety } from "../../ports";
import { tokens } from "../../tokens";
import { CheckServerDeleteSafetyQuery } from "./check-server-delete-safety.query";
import { type CheckServerDeleteSafetyQueryService } from "./check-server-delete-safety.query-service";

@QueryHandler(CheckServerDeleteSafetyQuery)
@injectable()
export class CheckServerDeleteSafetyQueryHandler
  implements QueryHandlerContract<CheckServerDeleteSafetyQuery, ServerDeleteSafety>
{
  constructor(
    @inject(tokens.checkServerDeleteSafetyQueryService)
    private readonly queryService: CheckServerDeleteSafetyQueryService,
  ) {}

  handle(context: ExecutionContext, query: CheckServerDeleteSafetyQuery) {
    return this.queryService.execute(context, query);
  }
}
