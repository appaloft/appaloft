import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  DefaultTenantContextResolver,
  type GitHubAppInstallationRepository,
  type GitHubAppRuntime,
  type GitHubRepositoryBrowser,
  type GitHubRepositorySummary,
  type IntegrationAuthPort,
  type IntegrationRegistry,
  type TenantContextResolver,
} from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class ListGitHubRepositoriesQueryService {
  constructor(
    @inject(tokens.integrationAuthPort)
    private readonly integrationAuthPort: IntegrationAuthPort,
    @inject(tokens.githubRepositoryBrowser)
    private readonly githubRepositoryBrowser: GitHubRepositoryBrowser,
    @inject(tokens.integrationRegistry)
    private readonly integrationRegistry: IntegrationRegistry,
    @inject(tokens.githubAppInstallationRepository)
    private readonly githubAppInstallationRepository: GitHubAppInstallationRepository,
    @inject(tokens.githubAppRuntime)
    private readonly githubAppRuntime: GitHubAppRuntime,
    @inject(tokens.tenantContextResolver)
    private readonly tenantContextResolver?: TenantContextResolver,
  ) {}

  async execute(
    context: ExecutionContext,
    input?: {
      search?: string;
    },
  ): Promise<Result<{ items: GitHubRepositorySummary[] }>> {
    const githubIntegration = this.integrationRegistry.findByKey("github");
    const mode = githubIntegration?.defaultConnectionModeKey ?? "user-oauth";

    if (mode === "hosted-provider-app" || mode === "operator-managed-app") {
      return this.listRepositoriesWithProviderApp(context, input);
    }

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
        accessTokenKind: "user",
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

  private async listRepositoriesWithProviderApp(
    context: ExecutionContext,
    input?: {
      search?: string;
    },
  ): Promise<Result<{ items: GitHubRepositorySummary[] }>> {
    const tenantContext = await (
      this.tenantContextResolver ?? new DefaultTenantContextResolver()
    ).resolveTenantContext(context);
    const effectiveContext = { ...context, tenant: tenantContext };
    const tenantId = tenantContext.tenantId;
    if (!tenantId) {
      return err(
        domainError.validation("GitHub App repository browsing requires a tenant context", {
          phase: "github-app-repository-browser",
        }),
      );
    }

    const installation = await this.githubAppInstallationRepository.findForTenant(
      toRepositoryContext(effectiveContext),
      {
        providerKey: "github",
        tenantId,
      },
    );
    if (installation.isErr()) {
      return err(installation.error);
    }
    if (!installation.value || installation.value.suspendedAt) {
      return err(
        domainError.validation(
          "GitHub App is not installed for this workspace. Install the GitHub App before browsing repositories.",
          {
            phase: "github-app-repository-browser",
          },
        ),
      );
    }

    const token = await this.githubAppRuntime.createInstallationAccessToken(effectiveContext, {
      installationId: installation.value.installationId,
    });
    if (token.isErr()) {
      return err(token.error);
    }

    try {
      const repositories = await this.githubRepositoryBrowser.listRepositories(effectiveContext, {
        accessToken: token.value.token,
        accessTokenKind: "installation",
        ...(input?.search ? { search: input.search } : {}),
      });

      return ok({
        items: repositories,
      });
    } catch (error) {
      return err(
        domainError.provider("Failed to load GitHub App installation repositories", {
          message: error instanceof Error ? error.message : "Unknown GitHub API error",
        }),
      );
    }
  }
}
