import { inject, injectable } from "tsyringe";
import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  GitHubAppConnectionQuery,
  type GitHubAppConnectionStatus,
} from "./github-app-connection.query";
import { type GitHubAppConnectionQueryService } from "./github-app-connection.query-service";

@QueryHandler(GitHubAppConnectionQuery)
@injectable()
export class GitHubAppConnectionQueryHandler
  implements QueryHandlerContract<GitHubAppConnectionQuery, GitHubAppConnectionStatus>
{
  constructor(
    @inject(tokens.githubAppConnectionQueryService)
    private readonly queryService: GitHubAppConnectionQueryService,
  ) {}

  handle(context: ExecutionContext) {
    return this.queryService.execute(context);
  }
}
