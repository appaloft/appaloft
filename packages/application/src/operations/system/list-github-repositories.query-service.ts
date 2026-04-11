import { domainError, err, ok, type Result } from "@yundu/core";
import { inject, injectable } from "tsyringe";
import { type ExecutionContext } from "../../execution-context";
import {
  type GitHubRepositoryBrowser,
  type GitHubRepositorySummary,
  type IntegrationAuthPort,
} from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class ListGitHubRepositoriesQueryService {
  constructor(
    @inject(tokens.integrationAuthPort)
    private readonly integrationAuthPort: IntegrationAuthPort,
    @inject(tokens.githubRepositoryBrowser)
    private readonly githubRepositoryBrowser: GitHubRepositoryBrowser,
  ) {}

  async execute(
    context: ExecutionContext,
    input?: {
      search?: string;
    },
  ): Promise<Result<{ items: GitHubRepositorySummary[] }>> {
    const accessToken = await this.integrationAuthPort.getProviderAccessToken(context, "github");

    if (!accessToken) {
      return err(
        domainError.validation(
          "GitHub account is not connected. Connect GitHub before browsing repositories.",
        ),
      );
    }

    try {
      const repositories = await this.githubRepositoryBrowser.listRepositories(context, {
        accessToken,
        ...(input?.search ? { search: input.search } : {}),
      });

      return ok({
        items: repositories,
      });
    } catch (error) {
      return err(
        domainError.provider("Failed to load GitHub repositories", {
          message: error instanceof Error ? error.message : "Unknown GitHub API error",
        }),
      );
    }
  }
}
