import {
  type ExecutionContext,
  validateWorkspaceActivationContextEvidence,
  validateWorkspaceTargetSelectionEvidence,
  type WorkspaceOpenEntry,
  type WorkspaceOpenEntryRepository,
  type WorkspaceOpenKey,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Kysely, type Selectable } from "kysely";

import { type Database } from "../schema";

type WorkspaceOpenEntryRow = Selectable<Database["workspace_open_entries"]>;

function tenantId(context: ExecutionContext): string {
  return context.tenant?.tenantId ?? "tenant_instance";
}

function whereKey<
  T extends {
    where(column: string, operator: "=", value: string): T;
  },
>(query: T, key: WorkspaceOpenKey): T {
  return query
    .where("tenant_id", "=", key.tenantId)
    .where("subject_id", "=", key.subjectId)
    .where("project_id", "=", key.projectId)
    .where("repository_identity", "=", key.repositoryIdentity)
    .where("branch", "=", key.branch);
}

function readEntry(row: WorkspaceOpenEntryRow): WorkspaceOpenEntry | undefined {
  if (!row.workspace_id) return undefined;
  const parsedTargetSelection =
    row.target_class && row.target_selection_source && row.target_selection_reason
      ? validateWorkspaceTargetSelectionEvidence({
          targetClass: row.target_class,
          source: row.target_selection_source,
          reason: row.target_selection_reason,
        })
      : undefined;
  const targetSelection =
    parsedTargetSelection?.isOk() === true
      ? parsedTargetSelection.value
      : {
          targetClass: "legacy-unclassified" as const,
          source: "legacy" as const,
          reason: "workspace_target_legacy_unclassified" as const,
        };
  const parsedActivation =
    row.activation_repository_binding_id &&
    row.activation_project_disposition &&
    row.activation_repository_binding_disposition &&
    row.activation_profile_disposition
      ? validateWorkspaceActivationContextEvidence({
          project: {
            projectId: row.project_id,
            disposition: row.activation_project_disposition,
          },
          repositoryBinding: {
            bindingId: row.activation_repository_binding_id,
            disposition: row.activation_repository_binding_disposition,
          },
          profile: {
            profileInstallationId: row.profile_installation_id,
            disposition: row.activation_profile_disposition,
          },
        })
      : undefined;
  return {
    workspaceId: row.workspace_id,
    ...(row.runtime_id ? { runtimeId: row.runtime_id } : {}),
    commitSha: row.commit_sha,
    profileInstallationId: row.profile_installation_id,
    status: row.status as WorkspaceOpenEntry["status"],
    targetSelection,
    ...(row.repository_identity ? { repositoryIdentity: row.repository_identity } : {}),
    ...(row.branch ? { branch: row.branch } : {}),
    ...(parsedActivation?.isOk() === true ? { activation: parsedActivation.value } : {}),
    ...(row.phase ? { phase: row.phase } : {}),
  };
}

export class PgWorkspaceOpenEntryRepository implements WorkspaceOpenEntryRepository {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly now: () => string,
  ) {}

  async findByWorkspaceIds(
    context: ExecutionContext,
    workspaceIds: readonly string[],
  ): Promise<ReadonlyMap<string, WorkspaceOpenEntry>> {
    const uniqueWorkspaceIds = [...new Set(workspaceIds)];
    if (uniqueWorkspaceIds.length === 0) return new Map();
    const rows = await this.db
      .selectFrom("workspace_open_entries")
      .selectAll()
      .where("tenant_id", "=", tenantId(context))
      .where("workspace_id", "in", uniqueWorkspaceIds)
      .execute();
    return new Map(
      rows.flatMap((row) => {
        const entry = readEntry(row);
        return entry ? [[entry.workspaceId, entry] as const] : [];
      }),
    );
  }

  async findByWorkspaceId(
    context: ExecutionContext,
    workspaceId: string,
  ): Promise<WorkspaceOpenEntry | undefined> {
    const row = await this.db
      .selectFrom("workspace_open_entries")
      .selectAll()
      .where("tenant_id", "=", tenantId(context))
      .where("workspace_id", "=", workspaceId)
      .executeTakeFirst();
    return row ? readEntry(row) : undefined;
  }

  async findPreferred(
    context: ExecutionContext,
    key: WorkspaceOpenKey,
    selection?: { readonly profileInstallationId?: string },
  ): Promise<WorkspaceOpenEntry | undefined> {
    void context;
    const scoped = whereKey(this.db.selectFrom("workspace_open_entries").selectAll(), key);
    const row = selection?.profileInstallationId
      ? await scoped
          .where("profile_installation_id", "=", selection.profileInstallationId)
          .where("status", "!=", "terminal")
          .orderBy("generation", "desc")
          .executeTakeFirst()
      : await scoped.where("preferred", "=", true).executeTakeFirst();
    return row ? readEntry(row) : undefined;
  }

  async begin(
    context: ExecutionContext,
    key: WorkspaceOpenKey,
    input: {
      commitSha: string;
      profileInstallationId: string;
      forceNew: boolean;
      targetSelection: Parameters<WorkspaceOpenEntryRepository["begin"]>[2]["targetSelection"];
      activation: Parameters<WorkspaceOpenEntryRepository["begin"]>[2]["activation"];
    },
  ): Promise<Result<{ workspaceId?: string; created: boolean }>> {
    if (key.tenantId !== tenantId(context)) {
      return err(domainError.resourceContextMismatch("Workspace open tenant scope does not match"));
    }
    const targetSelection = validateWorkspaceTargetSelectionEvidence(input.targetSelection);
    const activation = validateWorkspaceActivationContextEvidence(input.activation);
    if (targetSelection.isErr() || targetSelection.value.targetClass === "legacy-unclassified") {
      return err(
        targetSelection.isErr()
          ? targetSelection.error
          : domainError.validation("New Workspace entry requires canonical target evidence", {
              code: "workspace_target_selection_evidence_invalid",
            }),
      );
    }
    if (activation.isErr()) return err(activation.error);
    try {
      return await this.db.transaction().execute(async (transaction) => {
        const current = await whereKey(
          transaction
            .selectFrom("workspace_open_entries")
            .select(["workspace_id", "preferred", "generation"]),
          key,
        )
          .orderBy("generation", "desc")
          .execute();
        const preferred = current.find((entry) => entry.preferred);
        if (preferred && !input.forceNew) {
          return ok({
            ...(preferred.workspace_id ? { workspaceId: preferred.workspace_id } : {}),
            created: false,
          });
        }
        if (preferred) {
          await whereKey(transaction.updateTable("workspace_open_entries"), key)
            .where("preferred", "=", true)
            .set({ preferred: false, updated_at: this.now() })
            .execute();
        }
        const now = this.now();
        await transaction
          .insertInto("workspace_open_entries")
          .values({
            tenant_id: key.tenantId,
            subject_id: key.subjectId,
            project_id: key.projectId,
            repository_identity: key.repositoryIdentity,
            branch: key.branch,
            generation: (current[0]?.generation ?? 0) + 1,
            commit_sha: input.commitSha,
            profile_installation_id: input.profileInstallationId,
            target_class: input.targetSelection.targetClass,
            target_selection_source: input.targetSelection.source,
            target_selection_reason: input.targetSelection.reason,
            activation_repository_binding_id: input.activation.repositoryBinding.bindingId,
            activation_project_disposition: input.activation.project.disposition,
            activation_repository_binding_disposition:
              input.activation.repositoryBinding.disposition,
            activation_profile_disposition: input.activation.profile.disposition,
            workspace_id: null,
            runtime_id: null,
            status: "partial",
            phase: "workspace-open-planning",
            error_code: null,
            preferred: true,
            created_at: now,
            updated_at: now,
          })
          .execute();
        return ok({ created: true });
      });
    } catch {
      return err(
        domainError.conflict("Workspace open is already in progress", {
          code: "workspace_open_concurrent_request",
        }),
      );
    }
  }

  async complete(
    context: ExecutionContext,
    input: WorkspaceOpenKey & {
      workspaceId: string;
      runtimeId: string;
      commitSha: string;
    },
  ): Promise<Result<void>> {
    if (input.tenantId !== tenantId(context)) {
      return err(domainError.resourceContextMismatch("Workspace open tenant scope does not match"));
    }
    await whereKey(this.db.updateTable("workspace_open_entries"), input)
      .where("preferred", "=", true)
      .where("commit_sha", "=", input.commitSha)
      .set({
        workspace_id: input.workspaceId,
        runtime_id: input.runtimeId,
        status: "ready",
        phase: "workspace-open-ready",
        error_code: null,
        updated_at: this.now(),
      })
      .execute();
    return ok(undefined);
  }

  async fail(
    context: ExecutionContext,
    input: WorkspaceOpenKey & {
      workspaceId?: string;
      runtimeId?: string;
      commitSha: string;
      phase: string;
      code: string;
    },
  ): Promise<Result<void>> {
    if (input.tenantId !== tenantId(context)) {
      return err(domainError.resourceContextMismatch("Workspace open tenant scope does not match"));
    }
    await whereKey(this.db.updateTable("workspace_open_entries"), input)
      .where("preferred", "=", true)
      .where("commit_sha", "=", input.commitSha)
      .set({
        workspace_id: input.workspaceId ?? null,
        runtime_id: input.runtimeId ?? null,
        status: input.workspaceId ? "partial" : "terminal",
        phase: input.phase,
        error_code: input.code,
        preferred: Boolean(input.workspaceId),
        updated_at: this.now(),
      })
      .execute();
    return ok(undefined);
  }

  async markWorkspaceTerminated(
    context: ExecutionContext,
    workspaceId: string,
  ): Promise<Result<{ advanced: boolean }>> {
    const result = await this.db
      .updateTable("workspace_open_entries")
      .where("tenant_id", "=", tenantId(context))
      .where("workspace_id", "=", workspaceId)
      .where("status", "!=", "terminal")
      .set({
        status: "terminal",
        phase: "workspace-open-terminated",
        error_code: null,
        preferred: false,
        updated_at: this.now(),
      })
      .executeTakeFirst();
    return ok({ advanced: result.numUpdatedRows > 0n });
  }
}
