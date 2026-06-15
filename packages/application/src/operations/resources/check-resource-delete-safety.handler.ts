import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ResourceDeleteSafety } from "../../ports";
import { tokens } from "../../tokens";
import { CheckResourceDeleteSafetyQuery } from "./check-resource-delete-safety.query";
import { type CheckResourceDeleteSafetyQueryService } from "./check-resource-delete-safety.query-service";

@QueryHandler(CheckResourceDeleteSafetyQuery)
@injectable()
export class CheckResourceDeleteSafetyQueryHandler
  implements QueryHandlerContract<CheckResourceDeleteSafetyQuery, ResourceDeleteSafety>
{
  constructor(
    @inject(tokens.checkResourceDeleteSafetyQueryService)
    private readonly queryService: CheckResourceDeleteSafetyQueryService,
  ) {}

  handle(context: ExecutionContext, query: CheckResourceDeleteSafetyQuery) {
    return this.queryService.execute(context, query);
  }
}
