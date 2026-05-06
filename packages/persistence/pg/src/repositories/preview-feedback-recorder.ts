import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  createRepositorySpanName,
  type PreviewFeedbackChannel,
  type PreviewFeedbackRecord,
  type PreviewFeedbackRecorder,
  type PreviewFeedbackStatus,
  type RepositoryContext,
} from "@appaloft/application";
import { type Insertable, type Kysely, type Selectable } from "kysely";

import { type Database } from "../schema";
import { normalizeTimestamp, resolveRepositoryExecutor } from "./shared";

type PreviewFeedbackRow = Selectable<Database["preview_feedback_records"]>;

export class PgPreviewFeedbackRecorder implements PreviewFeedbackRecorder {
  constructor(private readonly db: Kysely<Database>) {}

  async findOne(
    context: RepositoryContext,
    input: { feedbackKey: string },
  ): Promise<PreviewFeedbackRecord | null> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("preview_feedback", "find_one"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "preview_feedback",
        },
      },
      async () => {
        const row = await executor
          .selectFrom("preview_feedback_records")
          .selectAll()
          .where("feedback_key", "=", input.feedbackKey)
          .executeTakeFirst();

        return row ? recordFromRow(row) : null;
      },
    );
  }

  async record(context: RepositoryContext, record: PreviewFeedbackRecord): Promise<void> {
    const executor = resolveRepositoryExecutor(this.db, context);
    const values = rowFromRecord(record);

    await context.tracer.startActiveSpan(
      createRepositorySpanName("preview_feedback", "record"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "preview_feedback",
          "appaloft.preview_feedback.channel": record.channel,
          "appaloft.preview_feedback.status": record.status,
        },
      },
      async () => {
        await executor
          .insertInto("preview_feedback_records")
          .values(values)
          .onConflict((conflict) =>
            conflict.column("feedback_key").doUpdateSet({
              source_event_id: values.source_event_id,
              preview_environment_id: values.preview_environment_id,
              channel: values.channel,
              status: values.status,
              provider_feedback_id: values.provider_feedback_id,
              error_code: values.error_code,
              retryable: values.retryable,
              updated_at: values.updated_at,
            }),
          )
          .execute();
      },
    );
  }
}

function rowFromRecord(
  record: PreviewFeedbackRecord,
): Insertable<Database["preview_feedback_records"]> {
  return {
    feedback_key: record.feedbackKey,
    source_event_id: record.sourceEventId,
    preview_environment_id: record.previewEnvironmentId,
    channel: record.channel,
    status: record.status,
    provider_feedback_id: record.providerFeedbackId ?? null,
    error_code: record.errorCode ?? null,
    retryable: record.retryable ?? null,
    updated_at: record.updatedAt,
  };
}

function recordFromRow(row: PreviewFeedbackRow): PreviewFeedbackRecord {
  return {
    feedbackKey: row.feedback_key,
    sourceEventId: row.source_event_id,
    previewEnvironmentId: row.preview_environment_id,
    channel: channelFromRow(row.channel),
    status: statusFromRow(row.status),
    updatedAt: normalizedRequiredTimestamp(row.updated_at),
    ...(row.provider_feedback_id ? { providerFeedbackId: row.provider_feedback_id } : {}),
    ...(row.error_code ? { errorCode: row.error_code } : {}),
    ...(row.retryable !== null ? { retryable: row.retryable } : {}),
  };
}

function channelFromRow(value: string): PreviewFeedbackChannel {
  switch (value) {
    case "github-check":
    case "github-deployment-status":
      return value;
    default:
      return "github-pr-comment";
  }
}

function statusFromRow(value: string): PreviewFeedbackStatus {
  switch (value) {
    case "retryable-failed":
    case "terminal-failed":
      return value;
    default:
      return "published";
  }
}

function normalizedRequiredTimestamp(value: string | Date): string {
  return normalizeTimestamp(value) ?? String(value);
}
