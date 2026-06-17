import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type EnvironmentProfileDiffSummary } from "../../ports";
import { tokens } from "../../tokens";
import { DiffEnvironmentProfileQuery } from "./diff-environment-profile.query";
import { type DiffEnvironmentProfileQueryService } from "./diff-environment-profile.query-service";

@QueryHandler(DiffEnvironmentProfileQuery)
@injectable()
export class DiffEnvironmentProfileQueryHandler
  implements QueryHandlerContract<DiffEnvironmentProfileQuery, EnvironmentProfileDiffSummary>
{
  constructor(
    @inject(tokens.diffEnvironmentProfileQueryService)
    private readonly queryService: DiffEnvironmentProfileQueryService,
  ) {}

  handle(context: ExecutionContext, query: DiffEnvironmentProfileQuery) {
    return this.queryService.execute(context, {
      environmentId: query.environmentId,
      targetEnvironmentId: query.targetEnvironmentId,
      ...(query.includeUnchanged === undefined ? {} : { includeUnchanged: query.includeUnchanged }),
    });
  }
}
