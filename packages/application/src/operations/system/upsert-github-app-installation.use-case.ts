import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type GitHubAppInstallationRepository, type GitHubAppRuntime } from "../../ports";
import { tokens } from "../../tokens";
import { type GitHubAppConnectionStatus } from "./github-app-connection.schema";

@injectable()
export class UpsertGitHubAppInstallationUseCase {
  constructor(
    @inject(tokens.githubAppRuntime)
    private readonly githubAppRuntime: GitHubAppRuntime,
    @inject(tokens.githubAppInstallationRepository)
    private readonly installationRepository: GitHubAppInstallationRepository,
  ) {}

  async execute(
    context: ExecutionContext,
    input: { installationId: string; setupAction?: "install" | "update" },
  ): Promise<Result<GitHubAppConnectionStatus>> {
    const tenantId = context.tenant?.tenantId;
    if (!tenantId) {
      return err(
        domainError.validation("GitHub App installation requires a tenant context", {
          phase: "github-app-installation",
        }),
      );
    }

    const readback = await this.githubAppRuntime.readInstallation(context, {
      installationId: input.installationId,
    });
    if (readback.isErr()) {
      return err(readback.error);
    }

    const now = new Date().toISOString();
    const record = await this.installationRepository.upsert(toRepositoryContext(context), {
      ...(readback.value.accountId ? { accountId: readback.value.accountId } : {}),
      ...(readback.value.accountLogin ? { accountLogin: readback.value.accountLogin } : {}),
      ...(readback.value.accountType ? { accountType: readback.value.accountType } : {}),
      installationId: readback.value.installationId,
      installedAt: now,
      providerKey: "github",
      ...(readback.value.repositoriesSelection
        ? { repositoriesSelection: readback.value.repositoriesSelection }
        : {}),
      ...(readback.value.repositoryCount !== undefined
        ? { repositoryCount: readback.value.repositoryCount }
        : {}),
      ...(readback.value.suspendedAt ? { suspendedAt: readback.value.suspendedAt } : {}),
      tenantId,
      updatedAt: now,
    });
    if (record.isErr()) {
      return err(record.error);
    }

    return ok({
      configurationStatus: "configured",
      connected: !record.value.suspendedAt,
      installationId: record.value.installationId,
      tenantId,
      updatedAt: record.value.updatedAt,
      ...(record.value.accountLogin ? { accountLogin: record.value.accountLogin } : {}),
      ...(record.value.accountType ? { accountType: record.value.accountType } : {}),
      ...(record.value.repositoryCount !== undefined
        ? { repositoryCount: record.value.repositoryCount }
        : {}),
      ...(record.value.repositoriesSelection
        ? { repositoriesSelection: record.value.repositoriesSelection }
        : {}),
      ...(record.value.suspendedAt ? { suspendedAt: record.value.suspendedAt } : {}),
    });
  }
}
