import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ProjectDeleteSafety } from "../../ports";
import { tokens } from "../../tokens";
import { CheckProjectDeleteSafetyQuery } from "./check-project-delete-safety.query";
import { type CheckProjectDeleteSafetyQueryService } from "./check-project-delete-safety.query-service";

@QueryHandler(CheckProjectDeleteSafetyQuery)
@injectable()
export class CheckProjectDeleteSafetyQueryHandler
  implements QueryHandlerContract<CheckProjectDeleteSafetyQuery, ProjectDeleteSafety>
{
  constructor(
    @inject(tokens.checkProjectDeleteSafetyQueryService)
    private readonly queryService: CheckProjectDeleteSafetyQueryService,
  ) {}

  handle(context: ExecutionContext, query: CheckProjectDeleteSafetyQuery) {
    return this.queryService.execute(context, query);
  }
}
