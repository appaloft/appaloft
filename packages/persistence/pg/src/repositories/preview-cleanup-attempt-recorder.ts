import {
  appaloftTraceAttributes,
  createRepositorySpanName,
  type PreviewCleanupAttemptRecord,
  type PreviewCleanupAttemptRecorder,
  type RepositoryContext,
} from "@appaloft/application";
import { type Insertable, type Kysely } from "kysely";

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
