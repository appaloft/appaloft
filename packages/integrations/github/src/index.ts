import {
  appaloftTraceAttributes,
  createAdapterSpanName,
  type ExecutionContext,
  type GitHubRepositoryBrowser,
  type GitHubRepositorySummary,
  type IntegrationDescriptor,
} from "@appaloft/application";

export const githubIntegration: IntegrationDescriptor = {
  key: "github",
  title: "GitHub",
  capabilities: ["repository-import", "webhook-ready", "future-pr-comment"],
};

interface GitHubRepositoryApiRecord {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  html_url: string;
  clone_url: string;
  updated_at: string;
  owner: {
    login: string;
  };
}

export class GitHubApiRepositoryBrowser implements GitHubRepositoryBrowser {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly apiBaseUrl = "https://api.github.com",
  ) {}

  async listRepositories(
    context: ExecutionContext,
    input: {
      accessToken: string;
      search?: string;
    },
  ): Promise<GitHubRepositorySummary[]> {
    return context.tracer.startActiveSpan(
      createAdapterSpanName("github_repository_browser", "list_repositories"),
      {
        attributes: {
          [appaloftTraceAttributes.integrationKey]: "github",
        },
      },
      async () => {
        const url = new URL("/user/repos", this.apiBaseUrl);
        url.searchParams.set("sort", "updated");
        url.searchParams.set("per_page", "100");
        url.searchParams.set("affiliation", "owner,collaborator,organization_member");

        const response = await this.fetcher(url, {
          headers: {
            accept: "application/vnd.github+json",
            authorization: `Bearer ${input.accessToken}`,
            "user-agent": "appaloft-control-plane",
            "x-github-api-version": "2022-11-28",
          },
        });

        if (!response.ok) {
          throw new Error(`GitHub API returned ${response.status}`);
        }

        const payload = (await response.json()) as GitHubRepositoryApiRecord[];
        const search = input.search?.trim().toLowerCase();

        return payload
          .filter((repository) =>
            search
              ? [
                  repository.name,
                  repository.full_name,
                  repository.owner.login,
                  repository.description ?? "",
                ]
                  .join(" ")
                  .toLowerCase()
                  .includes(search)
              : true,
          )
          .map((repository) => ({
            id: String(repository.id),
            name: repository.name,
            fullName: repository.full_name,
            ownerLogin: repository.owner.login,
            ...(repository.description ? { description: repository.description } : {}),
            private: repository.private,
            defaultBranch: repository.default_branch,
            htmlUrl: repository.html_url,
            cloneUrl: repository.clone_url,
            updatedAt: repository.updated_at,
          }))
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      },
    );
  }
}

export function createGitHubRepositoryBrowser(
  fetcher?: typeof fetch,
  apiBaseUrl?: string,
): GitHubRepositoryBrowser {
  return new GitHubApiRepositoryBrowser(fetcher, apiBaseUrl);
}
