import { inject, injectable } from "tsyringe";
import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type GitHubRepositorySummary } from "../../ports";
import { tokens } from "../../tokens";
import { ListGitHubRepositoriesQuery } from "./list-github-repositories.query";
import { type ListGitHubRepositoriesQueryService } from "./list-github-repositories.query-service";

@QueryHandler(ListGitHubRepositoriesQuery)
@injectable()
export class ListGitHubRepositoriesQueryHandler
  implements QueryHandlerContract<ListGitHubRepositoriesQuery, { items: GitHubRepositorySummary[] }>
{
  constructor(
    @inject(tokens.listGitHubRepositoriesQueryService)
    private readonly queryService: ListGitHubRepositoriesQueryService,
  ) {}

  handle(context: ExecutionContext, query: ListGitHubRepositoriesQuery) {
    return this.queryService.execute(context, {
      ...(query.search ? { search: query.search } : {}),
    });
  }
}
