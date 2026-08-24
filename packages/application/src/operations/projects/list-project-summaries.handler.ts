import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type DashboardProjectSummary } from "../../ports";
import { tokens } from "../../tokens";
import { ListProjectSummariesQuery } from "./list-project-summaries.query";
import { type ListProjectSummariesQueryService } from "./list-project-summaries.query-service";

@QueryHandler(ListProjectSummariesQuery)
@injectable()
export class ListProjectSummariesQueryHandler implements QueryHandlerContract<
  ListProjectSummariesQuery,
  { items: DashboardProjectSummary[]; nextCursor?: string }
> {
  constructor(
    @inject(tokens.listProjectSummariesQueryService)
    private readonly queryService: ListProjectSummariesQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ListProjectSummariesQuery,
  ): Promise<Result<{ items: DashboardProjectSummary[]; nextCursor?: string }>> {
    return this.queryService.execute(context, query);
  }
}
