import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type PreviewFeedbackChannel,
  type PreviewFeedbackRecorder,
  type PreviewFeedbackWriter,
} from "../../ports";
import { tokens } from "../../tokens";

export interface PublishPreviewFeedbackInput {
  feedbackKey: string;
  sourceEventId: string;
  previewEnvironmentId: string;
  channel: PreviewFeedbackChannel;
  repositoryFullName: string;
  pullRequestNumber: number;
  body: string;
  providerDeploymentId?: string;
}

export type PublishPreviewFeedbackStatus = "created" | "updated" | "retryable-failed" | "failed";
export type PublishPreviewCleanupFeedbackStatus = PublishPreviewFeedbackStatus | "skipped";

export interface PublishPreviewFeedbackResult {
  status: PublishPreviewFeedbackStatus;
  providerFeedbackId?: string;
  errorCode?: string;
  retryable?: boolean;
}

export interface PublishPreviewCleanupFeedbackInput {
  previewEnvironmentId: string;
  repositoryFullName: string;
  pullRequestNumber: number;
  body: string;
}

export interface PublishPreviewCleanupFeedbackResult {
  status: PublishPreviewCleanupFeedbackStatus;
  providerFeedbackId?: string;
  errorCode?: string;
  retryable?: boolean;
}

@injectable()
export class PreviewFeedbackService {
  constructor(
    @inject(tokens.previewFeedbackWriter)
    private readonly previewFeedbackWriter: PreviewFeedbackWriter,
    @inject(tokens.previewFeedbackRecorder)
    private readonly previewFeedbackRecorder: PreviewFeedbackRecorder,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async publish(
    context: ExecutionContext,
    input: PublishPreviewFeedbackInput,
  ): Promise<Result<PublishPreviewFeedbackResult>> {
    const repositoryContext = toRepositoryContext(context);
    const existing = await this.previewFeedbackRecorder.findOne(repositoryContext, {
      feedbackKey: input.feedbackKey,
    });
    const writerResult = await this.previewFeedbackWriter.publish(context, {
      ...input,
      ...(existing?.providerFeedbackId ? { providerFeedbackId: existing.providerFeedbackId } : {}),
    });
    const updatedAt = this.clock.now();

    if (writerResult.isErr()) {
      const status = writerResult.error.retryable ? "retryable-failed" : "terminal-failed";
      await this.previewFeedbackRecorder.record(repositoryContext, {
        feedbackKey: input.feedbackKey,
        sourceEventId: input.sourceEventId,
        previewEnvironmentId: input.previewEnvironmentId,
        channel: input.channel,
        status,
        ...(existing?.providerFeedbackId
          ? { providerFeedbackId: existing.providerFeedbackId }
          : {}),
        errorCode: writerResult.error.code,
        retryable: writerResult.error.retryable,
        updatedAt,
      });

      return ok({
        status: writerResult.error.retryable ? "retryable-failed" : "failed",
        ...(existing?.providerFeedbackId
          ? { providerFeedbackId: existing.providerFeedbackId }
          : {}),
        errorCode: writerResult.error.code,
        retryable: writerResult.error.retryable,
      });
    }

    await this.previewFeedbackRecorder.record(repositoryContext, {
      feedbackKey: input.feedbackKey,
      sourceEventId: input.sourceEventId,
      previewEnvironmentId: input.previewEnvironmentId,
      channel: input.channel,
      status: "published",
      providerFeedbackId: writerResult.value.providerFeedbackId,
      updatedAt,
    });

    return ok({
      status: existing?.providerFeedbackId ? "updated" : "created",
      providerFeedbackId: writerResult.value.providerFeedbackId,
    });
  }

  async publishCleanupUpdate(
    context: ExecutionContext,
    input: PublishPreviewCleanupFeedbackInput,
  ): Promise<Result<PublishPreviewCleanupFeedbackResult>> {
    const repositoryContext = toRepositoryContext(context);
    const existing = await this.previewFeedbackRecorder.findLatestForPreviewEnvironment(
      repositoryContext,
      {
        previewEnvironmentId: input.previewEnvironmentId,
        channel: "github-pr-comment",
      },
    );

    if (!existing) {
      return ok({ status: "skipped" });
    }

    return this.publish(context, {
      feedbackKey: existing.feedbackKey,
      sourceEventId: existing.sourceEventId,
      previewEnvironmentId: existing.previewEnvironmentId,
      channel: existing.channel,
      repositoryFullName: input.repositoryFullName,
      pullRequestNumber: input.pullRequestNumber,
      body: input.body,
    });
  }
}
