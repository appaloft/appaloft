import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ProjectEnvironmentOverview } from "../../ports";
import { tokens } from "../../tokens";
import { ProjectEnvironmentOverviewQuery } from "./project-environment-overview.query";
import { type ProjectEnvironmentOverviewQueryService } from "./project-environment-overview.query-service";

@QueryHandler(ProjectEnvironmentOverviewQuery)
@injectable()
export class ProjectEnvironmentOverviewQueryHandler implements QueryHandlerContract<
  ProjectEnvironmentOverviewQuery,
  ProjectEnvironmentOverview
> {
  constructor(
    @inject(tokens.projectEnvironmentOverviewQueryService)
    private readonly queryService: ProjectEnvironmentOverviewQueryService,
  ) {}

  handle(
    context: ExecutionContext,
    query: ProjectEnvironmentOverviewQuery,
  ): Promise<Result<ProjectEnvironmentOverview>> {
    return this.queryService.execute(context, query);
  }
}
