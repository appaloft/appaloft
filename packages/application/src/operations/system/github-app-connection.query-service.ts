import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  DefaultTenantContextResolver,
  type GitHubAppInstallationRepository,
  type IntegrationRegistry,
  type TenantContextResolver,
} from "../../ports";
import { tokens } from "../../tokens";
import { type GitHubAppConnectionStatus } from "./github-app-connection.schema";

@injectable()
export class GitHubAppConnectionQueryService {
  constructor(
    @inject(tokens.integrationRegistry)
    private readonly integrationRegistry: IntegrationRegistry,
    @inject(tokens.githubAppInstallationRepository)
    private readonly installationRepository: GitHubAppInstallationRepository,
    @inject(tokens.tenantContextResolver)
    private readonly tenantContextResolver?: TenantContextResolver,
  ) {}

  async execute(context: ExecutionContext): Promise<Result<GitHubAppConnectionStatus>> {
    const tenantContext = await (
      this.tenantContextResolver ?? new DefaultTenantContextResolver()
    ).resolveTenantContext(context);
    const effectiveContext = { ...context, tenant: tenantContext };
    const tenantId = tenantContext.tenantId;
    if (!tenantId) {
      return err(
        domainError.validation("GitHub App connection requires a tenant context", {
          phase: "github-app-connection",
        }),
      );
    }

    const integration = this.integrationRegistry.findByKey("github");
    const configurationStatus = integration?.configuration?.status ?? "unknown";
    const setup = integration?.setup?.providerApp;
    const installation = await this.installationRepository.findForTenant(
      toRepositoryContext(effectiveContext),
      {
        providerKey: "github",
        tenantId,
      },
    );

    if (installation.isErr()) {
      return err(installation.error);
    }

    return ok({
      configurationStatus,
      connected: Boolean(installation.value && !installation.value.suspendedAt),
      tenantId,
      ...(setup?.installUrl ? { installUrl: setup.installUrl } : {}),
      ...(setup?.callbackUrl ? { callbackUrl: setup.callbackUrl } : {}),
      ...(setup?.webhookUrl ? { webhookUrl: setup.webhookUrl } : {}),
      ...(installation.value?.installationId
        ? { installationId: installation.value.installationId }
        : {}),
      ...(installation.value?.accountLogin
        ? { accountLogin: installation.value.accountLogin }
        : {}),
      ...(installation.value?.accountType ? { accountType: installation.value.accountType } : {}),
      ...(installation.value?.repositoryCount !== undefined
        ? { repositoryCount: installation.value.repositoryCount }
        : {}),
      ...(installation.value?.repositoriesSelection
        ? { repositoriesSelection: installation.value.repositoriesSelection }
        : {}),
      ...(installation.value?.suspendedAt ? { suspendedAt: installation.value.suspendedAt } : {}),
      ...(installation.value?.updatedAt ? { updatedAt: installation.value.updatedAt } : {}),
    });
  }
}
