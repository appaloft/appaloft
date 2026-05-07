import {
  appaloftTraceAttributes,
  createRepositorySpanName,
  type PreviewCleanupAttemptRecord,
  type PreviewCleanupAttemptRecorder,
  type PreviewCleanupRetryCandidate,
  type PreviewCleanupRetryCandidateReader,
  type RepositoryContext,
} from "@appaloft/application";
import { type Insertable, type Kysely, type Selectable } from "kysely";

import { type Database } from "../schema";
import { resolveRepositoryExecutor } from "./shared";

export class PgPreviewCleanupAttemptRecorder implements PreviewCleanupAttemptRecorder {
  constructor(private readonly db: Kysely<Database>) {}

  async record(context: RepositoryContext, record: PreviewCleanupAttemptRecord): Promise<void> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const values = rowFromRecord(record);

    await context.tracer.startActiveSpan(
      createRepositorySpanName("preview_cleanup_attempt", "record"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "preview_cleanup_attempt",
          "appaloft.preview_cleanup_attempt.status": record.status,
          "appaloft.preview_cleanup_attempt.phase": record.phase,
        },
      },
      async () => {
        await executor
          .insertInto("preview_cleanup_attempts")
          .values(values)
          .onConflict((conflict) =>
            conflict.column("attempt_id").doUpdateSet({
              preview_environment_id: values.preview_environment_id,
              resource_id: values.resource_id,
              source_binding_fingerprint: values.source_binding_fingerprint,
              owner: values.owner,
              status: values.status,
              phase: values.phase,
              attempted_at: values.attempted_at,
              updated_at: values.updated_at,
              error_code: values.error_code,
              retryable: values.retryable,
              next_retry_at: values.next_retry_at,
            }),
          )
          .execute();
      },
    );
  }
}

type PreviewCleanupAttemptRow = Selectable<Database["preview_cleanup_attempts"]>;

export class PgPreviewCleanupRetryCandidateReader implements PreviewCleanupRetryCandidateReader {
  constructor(private readonly db: Kysely<Database>) {}

  async listDueRetries(
    context: RepositoryContext,
    input: {
      now: string;
      limit: number;
    },
  ): Promise<PreviewCleanupRetryCandidate[]> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("preview_cleanup_retry_candidate", "list_due_retries"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "preview_cleanup_retry_candidate",
        },
      },
      async () => {
        const nowMs = Date.parse(input.now);
        if (!Number.isFinite(nowMs) || input.limit <= 0) {
          return [];
        }

        const rows = await executor
          .selectFrom("preview_cleanup_attempts")
          .selectAll()
          .orderBy("next_retry_at", "asc")
          .orderBy("attempt_id", "asc")
          .execute();
        const latestRows = latestAttemptRowsByCleanupTarget(rows);
        const candidates = rows
          .filter((row) => retryRowIsDue(row, latestRows, nowMs))
          .slice(0, input.limit);

        return candidates.map((row) => ({
          attemptId: row.attempt_id,
          previewEnvironmentId: row.preview_environment_id,
          resourceId: row.resource_id,
          sourceBindingFingerprint: row.source_binding_fingerprint,
          owner: row.owner,
          phase: row.phase,
          nextRetryAt: normalizeTimestamp(row.next_retry_at ?? ""),
        }));
      },
    );
  }
}

function rowFromRecord(
  record: PreviewCleanupAttemptRecord,
): Insertable<Database["preview_cleanup_attempts"]> {
  return {
    attempt_id: record.attemptId,
    preview_environment_id: record.previewEnvironmentId,
    resource_id: record.resourceId,
    source_binding_fingerprint: record.sourceBindingFingerprint,
    owner: record.owner,
    status: record.status,
    phase: record.phase,
    attempted_at: record.attemptedAt,
    updated_at: record.updatedAt,
    error_code: record.errorCode ?? null,
    retryable: record.retryable ?? null,
    next_retry_at: record.nextRetryAt ?? null,
  };
}

function cleanupTargetKey(row: PreviewCleanupAttemptRow): string {
  return `${row.preview_environment_id}:${row.resource_id}:${row.source_binding_fingerprint}`;
}

function latestAttemptRowsByCleanupTarget(
  rows: PreviewCleanupAttemptRow[],
): Map<string, PreviewCleanupAttemptRow> {
  const latestRows = new Map<string, PreviewCleanupAttemptRow>();

  for (const row of rows) {
    const key = cleanupTargetKey(row);
    const current = latestRows.get(key);
    if (!current || compareAttemptOrder(row, current) > 0) {
      latestRows.set(key, row);
    }
  }

  return latestRows;
}

function compareAttemptOrder(
  left: PreviewCleanupAttemptRow,
  right: PreviewCleanupAttemptRow,
): number {
  const attemptedAtDelta = Date.parse(left.attempted_at) - Date.parse(right.attempted_at);
  if (attemptedAtDelta !== 0) {
    return attemptedAtDelta;
  }

  return left.attempt_id.localeCompare(right.attempt_id);
}

function retryRowIsDue(
  row: PreviewCleanupAttemptRow,
  latestRows: Map<string, PreviewCleanupAttemptRow>,
  nowMs: number,
): boolean {
  if (
    row.status !== "retry-scheduled" ||
    !row.next_retry_at ||
    latestRows.get(cleanupTargetKey(row))?.attempt_id !== row.attempt_id
  ) {
    return false;
  }

  const nextRetryAtMs = Date.parse(row.next_retry_at);
  return Number.isFinite(nextRetryAtMs) && nextRetryAtMs <= nowMs;
}

function normalizeTimestamp(value: string): string {
  return new Date(value).toISOString();
}
