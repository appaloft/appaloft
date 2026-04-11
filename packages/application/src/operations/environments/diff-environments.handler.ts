import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type EnvironmentDiffSummary } from "../../ports";
import { tokens } from "../../tokens";
import { DiffEnvironmentsQuery } from "./diff-environments.query";
import { type DiffEnvironmentsQueryService } from "./diff-environments.query-service";

@QueryHandler(DiffEnvironmentsQuery)
@injectable()
export class DiffEnvironmentsQueryHandler
  implements QueryHandlerContract<DiffEnvironmentsQuery, EnvironmentDiffSummary[]>
{
  constructor(
    @inject(tokens.diffEnvironmentsQueryService)
    private readonly queryService: DiffEnvironmentsQueryService,
  ) {}

  handle(context: ExecutionContext, query: DiffEnvironmentsQuery) {
    return this.queryService.execute(context, {
      environmentId: query.environmentId,
      otherEnvironmentId: query.otherEnvironmentId,
    });
  }
}
