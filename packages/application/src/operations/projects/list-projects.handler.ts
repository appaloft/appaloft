import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ProjectSummary } from "../../ports";
import { tokens } from "../../tokens";
import { ListProjectsQuery } from "./list-projects.query";
import { type ListProjectsQueryService } from "./list-projects.query-service";

@QueryHandler(ListProjectsQuery)
@injectable()
export class ListProjectsQueryHandler
  implements QueryHandlerContract<ListProjectsQuery, { items: ProjectSummary[] }>
{
  constructor(
    @inject(tokens.listProjectsQueryService)
    private readonly queryService: ListProjectsQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ListProjectsQuery,
  ): Promise<Result<{ items: ProjectSummary[] }>> {
    void query;
    return ok(await this.queryService.execute(context));
  }
}
