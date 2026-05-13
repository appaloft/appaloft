import {
  type RepositoryContext,
  type ResourceRuntimeLogArchiveCreateInput,
  type ResourceRuntimeLogArchiveDetail,
  type ResourceRuntimeLogArchiveListInput,
  type ResourceRuntimeLogArchiveListPage,
  type ResourceRuntimeLogArchivePruneInput,
  type ResourceRuntimeLogArchivePruneStoreResult,
  type ResourceRuntimeLogArchiveShowInput,
  type ResourceRuntimeLogArchiveStore,
  type ResourceRuntimeLogArchiveSummary,
  type ResourceRuntimeLogLine,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Kysely, type Selectable } from "kysely";

import { type Database, type ResourceRuntimeLogArchivesTable } from "../schema";
import { resolveRepositoryExecutor } from "./shared";

type RuntimeLogArchiveRow = Selectable<ResourceRuntimeLogArchivesTable>;

export class PgResourceRuntimeLogArchiveStore implements ResourceRuntimeLogArchiveStore {
  constructor(private readonly db: Kysely<Database>) {}

  async create(
    context: RepositoryContext,
    input: ResourceRuntimeLogArchiveCreateInput,
  ): Promise<Result<ResourceRuntimeLogArchiveDetail>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      await executor
        .insertInto("resource_runtime_log_archives")
        .values({
          id: input.archiveId,
          resource_id: input.resourceId,
          deployment_id: input.deploymentId ?? null,
          server_id: input.serverId ?? null,
          service_name: input.serviceName ?? null,
          runtime_kind: input.runtimeKind ?? null,
          captured_at: input.capturedAt,
          reason: input.reason ?? null,
          line_count: input.lines.length,
          retention_status: "retained",
          lines: serializeLines(input.lines),
        })
        .execute();

      return ok(detailFromInput(input));
    } catch (error) {
      return err(infraError(error));
    }
  }

  async list(
    context: RepositoryContext,
    input: ResourceRuntimeLogArchiveListInput,
  ): Promise<Result<ResourceRuntimeLogArchiveListPage>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      let query = executor
        .selectFrom("resource_runtime_log_archives")
        .select([
          "id",
          "resource_id",
          "deployment_id",
          "server_id",
          "service_name",
          "runtime_kind",
          "captured_at",
          "reason",
          "line_count",
          "retention_status",
        ])
        .orderBy("captured_at", "desc")
        .limit(input.limit + 1);

      if (input.resourceId) {
        query = query.where("resource_id", "=", input.resourceId);
      }

      if (input.deploymentId) {
        query = query.where("deployment_id", "=", input.deploymentId);
      }

      if (input.serverId) {
        query = query.where("server_id", "=", input.serverId);
      }

      if (input.serviceName) {
        query = query.where("service_name", "=", input.serviceName);
      }

      if (input.cursor) {
        query = query.where("captured_at", "<", input.cursor);
      }

      const rows = await query.execute();
      const pageRows = rows.slice(0, input.limit);
      const nextCursor = rows.length > input.limit ? pageRows.at(-1)?.captured_at : undefined;

      return ok({
        items: pageRows.map(summaryFromRow),
        ...(nextCursor ? { nextCursor: serializeTimestamp(nextCursor) } : {}),
      });
    } catch (error) {
      return err(infraError(error));
    }
  }

  async findOne(
    context: RepositoryContext,
    input: ResourceRuntimeLogArchiveShowInput,
  ): Promise<Result<ResourceRuntimeLogArchiveDetail | null>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      const row = await executor
        .selectFrom("resource_runtime_log_archives")
        .selectAll()
        .where("id", "=", input.archiveId)
        .executeTakeFirst();

      return ok(row ? detailFromRow(row) : null);
    } catch (error) {
      return err(infraError(error));
    }
  }

  async prune(
    context: RepositoryContext,
    input: ResourceRuntimeLogArchivePruneInput,
  ): Promise<Result<ResourceRuntimeLogArchivePruneStoreResult>> {
    const executor = resolveRepositoryExecutor(this.db, context);

    try {
      let query = executor
        .selectFrom("resource_runtime_log_archives")
        .select(["id", "resource_id"])
        .where("captured_at", "<", input.before);

      if (input.resourceId) {
        query = query.where("resource_id", "=", input.resourceId);
      }

      if (input.deploymentId) {
        query = query.where("deployment_id", "=", input.deploymentId);
      }

      if (input.serverId) {
        query = query.where("server_id", "=", input.serverId);
      }

      if (input.serviceName) {
        query = query.where("service_name", "=", input.serviceName);
      }

      const rows = await query.execute();
      const affectedResourceCount = new Set(rows.map((row) => row.resource_id)).size;

      if (!input.dryRun && rows.length > 0) {
        await executor
          .deleteFrom("resource_runtime_log_archives")
          .where(
            "id",
            "in",
            rows.map((row) => row.id),
          )
          .execute();
      }

      return ok({
        matchedCount: rows.length,
        prunedCount: input.dryRun ? 0 : rows.length,
        affectedResourceCount,
      });
    } catch (error) {
      return err(infraError(error));
    }
  }
}

function detailFromInput(
  input: ResourceRuntimeLogArchiveCreateInput,
): ResourceRuntimeLogArchiveDetail {
  return {
    archiveId: input.archiveId,
    resourceId: input.resourceId,
    capturedAt: input.capturedAt,
    lineCount: input.lines.length,
    retentionStatus: "retained",
    lines: input.lines,
    ...(input.deploymentId ? { deploymentId: input.deploymentId } : {}),
    ...(input.serverId ? { serverId: input.serverId } : {}),
    ...(input.serviceName ? { serviceName: input.serviceName } : {}),
    ...(input.runtimeKind ? { runtimeKind: input.runtimeKind } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
  };
}

function summaryFromRow(
  row: Omit<RuntimeLogArchiveRow, "lines">,
): ResourceRuntimeLogArchiveSummary {
  return {
    archiveId: row.id,
    resourceId: row.resource_id,
    capturedAt: serializeTimestamp(row.captured_at),
    lineCount: row.line_count,
    retentionStatus: "retained",
    ...(row.deployment_id ? { deploymentId: row.deployment_id } : {}),
    ...(row.server_id ? { serverId: row.server_id } : {}),
    ...(row.service_name ? { serviceName: row.service_name } : {}),
    ...(row.runtime_kind ? { runtimeKind: row.runtime_kind } : {}),
    ...(row.reason ? { reason: row.reason } : {}),
  };
}

function detailFromRow(row: RuntimeLogArchiveRow): ResourceRuntimeLogArchiveDetail {
  return {
    ...summaryFromRow(row),
    lines: safeLines(row.lines),
  };
}

function safeLines(value: unknown): ResourceRuntimeLogLine[] {
  return Array.isArray(value)
    ? value.filter((line): line is ResourceRuntimeLogLine => isRuntimeLogLine(line))
    : [];
}

function serializeLines(lines: ResourceRuntimeLogLine[]): Record<string, unknown>[] {
  return lines.map((line) => ({
    resourceId: line.resourceId,
    ...(line.deploymentId ? { deploymentId: line.deploymentId } : {}),
    ...(line.serviceName ? { serviceName: line.serviceName } : {}),
    ...(line.runtimeKind ? { runtimeKind: line.runtimeKind } : {}),
    ...(line.runtimeInstanceId ? { runtimeInstanceId: line.runtimeInstanceId } : {}),
    ...(line.stream ? { stream: line.stream } : {}),
    ...(line.timestamp ? { timestamp: line.timestamp } : {}),
    ...(line.sequence !== undefined ? { sequence: line.sequence } : {}),
    ...(line.cursor ? { cursor: line.cursor } : {}),
    message: line.message,
    masked: line.masked,
  }));
}

function isRuntimeLogLine(value: unknown): value is ResourceRuntimeLogLine {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { resourceId?: unknown }).resourceId === "string" &&
    typeof (value as { message?: unknown }).message === "string" &&
    typeof (value as { masked?: unknown }).masked === "boolean"
  );
}

function serializeTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function infraError(error: unknown) {
  return domainError.infra("Runtime log archive store operation could not be completed", {
    phase: "runtime-log-archive-retention",
    adapter: "persistence.pg",
    reason: error instanceof Error ? error.message : "unknown",
  });
}
