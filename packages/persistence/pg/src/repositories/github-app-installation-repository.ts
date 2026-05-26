import {
  type GitHubAppInstallationRecord,
  type GitHubAppInstallationRepository,
  type RepositoryContext,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";
import { type Insertable, type Kysely, type Selectable } from "kysely";

import { type Database, type GitHubAppInstallationsTable } from "../schema";
import { resolveRepositoryExecutor } from "./shared";

type GitHubAppInstallationRow = Selectable<GitHubAppInstallationsTable>;

export class PgGitHubAppInstallationRepository implements GitHubAppInstallationRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async findForTenant(
    context: RepositoryContext,
    input: { tenantId: string; providerKey: "github" },
  ): Promise<Result<GitHubAppInstallationRecord | null>> {
    const row = await resolveRepositoryExecutor(context, this.db)
      .selectFrom("github_app_installations")
      .selectAll()
      .where("tenant_id", "=", input.tenantId)
      .where("provider_key", "=", input.providerKey)
      .executeTakeFirst();

    return ok(row ? recordFromRow(row) : null);
  }

  async findByInstallationId(
    context: RepositoryContext,
    input: { installationId: string; providerKey: "github" },
  ): Promise<Result<GitHubAppInstallationRecord | null>> {
    const row = await resolveRepositoryExecutor(context, this.db)
      .selectFrom("github_app_installations")
      .selectAll()
      .where("provider_key", "=", input.providerKey)
      .where("installation_id", "=", input.installationId)
      .executeTakeFirst();

    return ok(row ? recordFromRow(row) : null);
  }

  async upsert(
    context: RepositoryContext,
    record: GitHubAppInstallationRecord,
  ): Promise<Result<GitHubAppInstallationRecord>> {
    const values = valuesFromRecord(record);
    const row = await resolveRepositoryExecutor(context, this.db)
      .insertInto("github_app_installations")
      .values(values)
      .onConflict((oc) =>
        oc.columns(["tenant_id", "provider_key"]).doUpdateSet({
          account_id: values.account_id,
          account_login: values.account_login,
          account_type: values.account_type,
          installation_id: values.installation_id,
          installed_at: values.installed_at,
          repositories_selection: values.repositories_selection,
          repository_count: values.repository_count,
          suspended_at: values.suspended_at,
          updated_at: values.updated_at,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();

    return ok(recordFromRow(row));
  }

  async markSuspended(
    context: RepositoryContext,
    input: { installationId: string; providerKey: "github"; suspendedAt: string },
  ): Promise<Result<GitHubAppInstallationRecord | null>> {
    const row = await resolveRepositoryExecutor(context, this.db)
      .updateTable("github_app_installations")
      .set({
        suspended_at: input.suspendedAt,
        updated_at: input.suspendedAt,
      })
      .where("provider_key", "=", input.providerKey)
      .where("installation_id", "=", input.installationId)
      .returningAll()
      .executeTakeFirst();

    return ok(row ? recordFromRow(row) : null);
  }
}

function valuesFromRecord(
  record: GitHubAppInstallationRecord,
): Insertable<Database["github_app_installations"]> {
  return {
    account_id: record.accountId ?? null,
    account_login: record.accountLogin ?? null,
    account_type: record.accountType ?? null,
    installation_id: record.installationId,
    installed_at: record.installedAt,
    provider_key: record.providerKey,
    repositories_selection: record.repositoriesSelection ?? null,
    repository_count: record.repositoryCount ?? null,
    suspended_at: record.suspendedAt ?? null,
    tenant_id: record.tenantId,
    updated_at: record.updatedAt,
  };
}

function recordFromRow(row: GitHubAppInstallationRow): GitHubAppInstallationRecord {
  return {
    accountId: row.account_id ?? undefined,
    accountLogin: row.account_login ?? undefined,
    accountType: row.account_type ?? undefined,
    installationId: row.installation_id,
    installedAt: row.installed_at,
    providerKey: "github",
    repositoriesSelection:
      row.repositories_selection === "all" || row.repositories_selection === "selected"
        ? row.repositories_selection
        : undefined,
    repositoryCount: row.repository_count ?? undefined,
    suspendedAt: row.suspended_at ?? undefined,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at,
  };
}
