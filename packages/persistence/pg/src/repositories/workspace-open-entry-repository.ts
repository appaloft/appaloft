import {
  type ExecutionContext,
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
  return {
    workspaceId: row.workspace_id,
    ...(row.runtime_id ? { runtimeId: row.runtime_id } : {}),
    commitSha: row.commit_sha,
    profileInstallationId: row.profile_installation_id,
    status: row.status as WorkspaceOpenEntry["status"],
    ...(row.phase ? { phase: row.phase } : {}),
  };
}

export class PgWorkspaceOpenEntryRepository implements WorkspaceOpenEntryRepository {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly now: () => string,
  ) {}

  async findPreferred(
    context: ExecutionContext,
    key: WorkspaceOpenKey,
  ): Promise<WorkspaceOpenEntry | undefined> {
    void context;
    const row = await whereKey(this.db.selectFrom("workspace_open_entries").selectAll(), key)
      .where("preferred", "=", true)
      .executeTakeFirst();
    return row ? readEntry(row) : undefined;
  }

  async begin(
    context: ExecutionContext,
    key: WorkspaceOpenKey,
    input: {
      commitSha: string;
      profileInstallationId: string;
      forceNew: boolean;
    },
  ): Promise<Result<{ workspaceId?: string; created: boolean }>> {
    if (key.tenantId !== tenantId(context)) {
      return err(domainError.resourceContextMismatch("Workspace open tenant scope does not match"));
    }
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
