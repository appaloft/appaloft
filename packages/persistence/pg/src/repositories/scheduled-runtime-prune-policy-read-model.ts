import {
  type RepositoryContext,
  type RuntimeTargetPruneCategory,
  type ScheduledRuntimePrunePolicy,
  type ScheduledRuntimePrunePolicyListFilter,
  type ScheduledRuntimePrunePolicyReadModel,
  type ScheduledRuntimePrunePolicyRecord,
  type ScheduledRuntimePrunePolicyRepository,
  type ScheduledRuntimePrunePolicyScope,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Kysely, type Selectable } from "kysely";

import { type Database } from "../schema";
import { resolveRepositoryContextOrganizationId, resolveRepositoryExecutor } from "./shared";

type ScheduledRuntimePrunePolicyRow = Selectable<Database["scheduled_runtime_prune_policies"]>;

const policyScopes: ReadonlySet<ScheduledRuntimePrunePolicyScope> = new Set([
  "defaults",
  "system",
  "organization",
  "project",
  "environment",
  "deployment-snapshot",
]);

const pruneCategories: ReadonlySet<RuntimeTargetPruneCategory> = new Set([
  "stopped-containers",
  "preview-workspaces",
  "source-workspaces",
  "docker-build-cache",
  "unused-images",
]);

function parseCategories(value: unknown): RuntimeTargetPruneCategory[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (category): category is RuntimeTargetPruneCategory =>
      typeof category === "string" && pruneCategories.has(category as RuntimeTargetPruneCategory),
  );
}

function toPolicyRecord(
  row: ScheduledRuntimePrunePolicyRow,
): ScheduledRuntimePrunePolicyRecord | null {
  if (!policyScopes.has(row.scope as ScheduledRuntimePrunePolicyScope)) {
    return null;
  }

  return {
    id: row.id,
    version: row.version,
    scope: row.scope as ScheduledRuntimePrunePolicyScope,
    serverId: row.server_id,
    retentionDays: row.retention_days,
    destructive: row.destructive,
    categories: parseCategories(row.categories),
    retryOnFailure: row.retry_on_failure,
    enabled: row.enabled,
    updatedAt: serializeTimestamp(row.updated_at),
  };
}

function serializeTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

export class PgScheduledRuntimePrunePolicyReadModel
  implements ScheduledRuntimePrunePolicyReadModel, ScheduledRuntimePrunePolicyRepository
{
  constructor(private readonly db: Kysely<Database>) {}

  async findOne(
    context: RepositoryContext,
    policyId: string,
  ): Promise<Result<ScheduledRuntimePrunePolicyRecord | null>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      let query = executor
        .selectFrom("scheduled_runtime_prune_policies")
        .selectAll()
        .where("id", "=", policyId);
      const organizationId = resolveRepositoryContextOrganizationId(context);
      if (organizationId) {
        query = query.where((eb) =>
          eb.or([
            eb("server_id", "=", "*"),
            eb("server_id", "in", (subquery) =>
              subquery
                .selectFrom("servers")
                .select("id")
                .where("organization_id", "=", organizationId),
            ),
          ]),
        );
      }

      const row = await query.executeTakeFirst();

      return ok(row ? toPolicyRecord(row) : null);
    } catch (error) {
      return err(
        domainError.infra("Scheduled runtime prune policy could not be read", {
          phase: "scheduled-runtime-prune-policy-read",
          adapter: "persistence.pg",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }

  async list(
    context: RepositoryContext,
    filter: ScheduledRuntimePrunePolicyListFilter = {},
  ): Promise<Result<ScheduledRuntimePrunePolicy[]>> {
    const records = await this.listRecords(context, {
      ...filter,
      enabledOnly: filter.enabledOnly ?? true,
    });
    if (records.isErr()) {
      return err(records.error);
    }

    return ok(
      records.value.map((record) => ({
        id: record.id,
        version: record.version,
        scope: record.scope,
        serverId: record.serverId,
        retentionDays: record.retentionDays,
        destructive: record.destructive,
        categories: record.categories,
        retryOnFailure: record.retryOnFailure,
      })),
    );
  }

  async listRecords(
    context: RepositoryContext,
    filter: ScheduledRuntimePrunePolicyListFilter = {},
  ): Promise<Result<ScheduledRuntimePrunePolicyRecord[]>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      let query = executor.selectFrom("scheduled_runtime_prune_policies").selectAll();
      const organizationId = resolveRepositoryContextOrganizationId(context);
      if (organizationId) {
        query = query.where((eb) =>
          eb.or([
            eb("server_id", "=", "*"),
            eb("server_id", "in", (subquery) =>
              subquery
                .selectFrom("servers")
                .select("id")
                .where("organization_id", "=", organizationId),
            ),
          ]),
        );
      }

      if (filter.enabledOnly === true) {
        query = query.where("enabled", "=", true);
      }

      if (filter.serverId) {
        query = query.where((eb) =>
          eb.or([eb("server_id", "=", filter.serverId ?? ""), eb("server_id", "=", "*")]),
        );
      }

      if (filter.scopes && filter.scopes.length > 0) {
        query = query.where("scope", "in", [...filter.scopes]);
      }

      const rows = await query.orderBy("updated_at", "asc").execute();
      return ok(
        rows.flatMap((row) => {
          const policy = toPolicyRecord(row);
          return policy ? [policy] : [];
        }),
      );
    } catch (error) {
      return err(
        domainError.infra("Scheduled runtime prune policies could not be listed", {
          phase: "scheduled-runtime-prune-policy-read",
          adapter: "persistence.pg",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }

  async upsert(
    context: RepositoryContext,
    record: ScheduledRuntimePrunePolicyRecord,
  ): Promise<Result<ScheduledRuntimePrunePolicyRecord>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      await executor
        .insertInto("scheduled_runtime_prune_policies")
        .values({
          id: record.id,
          version: record.version,
          scope: record.scope,
          server_id: record.serverId,
          retention_days: record.retentionDays,
          destructive: record.destructive === true,
          categories: record.categories ?? [],
          retry_on_failure: record.retryOnFailure !== false,
          enabled: record.enabled,
          updated_at: record.updatedAt,
        })
        .onConflict((conflict) =>
          conflict.column("id").doUpdateSet({
            version: record.version,
            scope: record.scope,
            server_id: record.serverId,
            retention_days: record.retentionDays,
            destructive: record.destructive === true,
            categories: record.categories ?? [],
            retry_on_failure: record.retryOnFailure !== false,
            enabled: record.enabled,
            updated_at: record.updatedAt,
          }),
        )
        .execute();

      return ok(record);
    } catch (error) {
      return err(
        domainError.infra("Scheduled runtime prune policy could not be persisted", {
          phase: "scheduled-runtime-prune-policy-write",
          adapter: "persistence.pg",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }
}
