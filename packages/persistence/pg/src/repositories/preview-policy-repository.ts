import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  createRepositorySpanName,
  defaultPreviewPolicySettings,
  type PreviewPolicyReadModel,
  type PreviewPolicyRecord,
  type PreviewPolicyRepository,
  type PreviewPolicyScope,
  type PreviewPolicySettings,
  type PreviewPolicySummary,
  type RepositoryContext,
} from "@appaloft/application";
import { type Insertable, type Kysely, type Selectable } from "kysely";

import { type Database } from "../schema";
import { normalizeTimestamp, resolveRepositoryExecutor } from "./shared";

type PreviewPolicyRow = Selectable<Database["preview_policies"]>;

export class PgPreviewPolicyRepository implements PreviewPolicyRepository, PreviewPolicyReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async findOne(
    context: RepositoryContext,
    scope: PreviewPolicyScope,
  ): Promise<PreviewPolicyRecord | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("preview_policy", "find_one"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "preview_policy",
          "appaloft.preview_policy.scope_kind": scope.kind,
        },
      },
      async () => {
        const row = await executor
          .selectFrom("preview_policies")
          .selectAll()
          .where("scope_key", "=", scopeKey(scope))
          .executeTakeFirst();

        return row ? recordFromRow(row) : null;
      },
    );
  }

  async upsert(
    context: RepositoryContext,
    record: PreviewPolicyRecord,
  ): Promise<PreviewPolicyRecord> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const values = rowFromRecord(record);

    return context.tracer.startActiveSpan(
      createRepositorySpanName("preview_policy", "upsert"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "preview_policy",
          "appaloft.preview_policy.scope_kind": record.scope.kind,
        },
      },
      async () => {
        const row = await executor
          .insertInto("preview_policies")
          .values(values)
          .onConflict((conflict) =>
            conflict.column("scope_key").doUpdateSet({
              id: values.id,
              scope_kind: values.scope_kind,
              project_id: values.project_id,
              resource_id: values.resource_id,
              same_repository_previews: values.same_repository_previews,
              fork_previews: values.fork_previews,
              secret_backed_previews: values.secret_backed_previews,
              last_idempotency_key: values.last_idempotency_key,
              updated_at: values.updated_at,
            }),
          )
          .returningAll()
          .executeTakeFirstOrThrow();

        return recordFromRow(row);
      },
    );
  }

  async findOneSummary(
    context: RepositoryContext,
    scope: PreviewPolicyScope,
  ): Promise<PreviewPolicySummary> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("preview_policy", "find_one_summary"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "preview_policy",
          "appaloft.preview_policy.scope_kind": scope.kind,
        },
      },
      async () => {
        const row = await executor
          .selectFrom("preview_policies")
          .selectAll()
          .where("scope_key", "=", scopeKey(scope))
          .executeTakeFirst();

        return row ? summaryFromRow(row) : defaultSummary(scope);
      },
    );
  }
}

function scopeKey(scope: PreviewPolicyScope): string {
  return scope.kind === "project"
    ? `project:${scope.projectId}`
    : `resource:${scope.projectId}:${scope.resourceId}`;
}

function scopeFromRow(row: PreviewPolicyRow): PreviewPolicyScope {
  return row.scope_kind === "resource" && row.resource_id
    ? { kind: "resource", projectId: row.project_id, resourceId: row.resource_id }
    : { kind: "project", projectId: row.project_id };
}

function settingsFromRow(row: PreviewPolicyRow): PreviewPolicySettings {
  return {
    sameRepositoryPreviews: row.same_repository_previews,
    forkPreviews:
      row.fork_previews === "without-secrets" || row.fork_previews === "with-secrets"
        ? row.fork_previews
        : "disabled",
    secretBackedPreviews: row.secret_backed_previews,
  };
}

function rowFromRecord(record: PreviewPolicyRecord): Insertable<Database["preview_policies"]> {
  return {
    id: record.id,
    scope_kind: record.scope.kind,
    scope_key: scopeKey(record.scope),
    project_id: record.scope.projectId,
    resource_id: record.scope.kind === "resource" ? record.scope.resourceId : null,
    same_repository_previews: record.settings.sameRepositoryPreviews,
    fork_previews: record.settings.forkPreviews,
    secret_backed_previews: record.settings.secretBackedPreviews,
    last_idempotency_key: record.idempotencyKey ?? null,
    updated_at: record.updatedAt,
  };
}

function recordFromRow(row: PreviewPolicyRow): PreviewPolicyRecord {
  return {
    id: row.id,
    scope: scopeFromRow(row),
    settings: settingsFromRow(row),
    updatedAt: normalizedRequiredTimestamp(row.updated_at),
    ...(row.last_idempotency_key ? { idempotencyKey: row.last_idempotency_key } : {}),
  };
}

function summaryFromRow(row: PreviewPolicyRow): PreviewPolicySummary {
  return {
    id: row.id,
    scope: scopeFromRow(row),
    source: "configured",
    settings: settingsFromRow(row),
    updatedAt: normalizedRequiredTimestamp(row.updated_at),
  };
}

function defaultSummary(scope: PreviewPolicyScope): PreviewPolicySummary {
  return {
    scope,
    source: "default",
    settings: { ...defaultPreviewPolicySettings },
  };
}

function normalizedRequiredTimestamp(value: string | Date): string {
  return normalizeTimestamp(value) ?? String(value);
}
