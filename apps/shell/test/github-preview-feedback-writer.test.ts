import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  createExecutionContext,
  type ExecutionContext,
  type IntegrationAuthPort,
  type PreviewFeedbackWriter,
  type PreviewFeedbackWriterInput,
  type PreviewFeedbackWriterResult,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";

import { ShellGitHubPreviewFeedbackWriter } from "../src/register-runtime-dependencies";

class StubIntegrationAuthPort implements IntegrationAuthPort {
  constructor(private readonly accessToken: string | null) {}

  async getProviderAccessToken(
    _context: ExecutionContext,
    _providerKey: "github",
  ): Promise<string | null> {
    return this.accessToken;
  }
}

class CapturingPreviewFeedbackWriter implements PreviewFeedbackWriter {
  readonly inputs: PreviewFeedbackWriterInput[] = [];

  constructor(
    private readonly accessToken: string,
    private readonly tokenSink: string[],
  ) {}

  async publish(
    _context: ExecutionContext,
    input: PreviewFeedbackWriterInput,
  ): Promise<Result<PreviewFeedbackWriterResult>> {
    this.tokenSink.push(this.accessToken);
    this.inputs.push(input);
    return ok({ providerFeedbackId: `feedback_${this.tokenSink.length}` });
  }
}

function previewFeedbackInput(): PreviewFeedbackWriterInput {
  return {
    feedbackKey: "feedback:src_evt_1:github-pr-comment",
    sourceEventId: "src_evt_1",
    previewEnvironmentId: "prenv_1",
    channel: "github-pr-comment",
    repositoryFullName: "appaloft/example",
    pullRequestNumber: 42,
    body: "Preview deployment accepted.",
  };
}

describe("ShellGitHubPreviewFeedbackWriter", () => {
  test("[PG-PREVIEW-FEEDBACK-001] uses worker token when no request-scoped GitHub token exists", async () => {
    const usedTokens: string[] = [];
    const writer = new ShellGitHubPreviewFeedbackWriter(
      new StubIntegrationAuthPort(null),
      "worker-token",
      (accessToken) => new CapturingPreviewFeedbackWriter(accessToken, usedTokens),
    );

    const result = await writer.publish(
      createExecutionContext({
        entrypoint: "system",
        requestId: "req_preview_worker_feedback",
      }),
      previewFeedbackInput(),
    );

    expect(result._unsafeUnwrap()).toEqual({ providerFeedbackId: "feedback_1" });
    expect(usedTokens).toEqual(["worker-token"]);
  });

  test("[PG-PREVIEW-FEEDBACK-001] prefers request-scoped GitHub token over worker token", async () => {
    const usedTokens: string[] = [];
    const writer = new ShellGitHubPreviewFeedbackWriter(
      new StubIntegrationAuthPort("request-token"),
      "worker-token",
      (accessToken) => new CapturingPreviewFeedbackWriter(accessToken, usedTokens),
    );

    const result = await writer.publish(
      createExecutionContext({
        entrypoint: "http",
        requestId: "req_preview_request_feedback",
      }),
      previewFeedbackInput(),
    );

    expect(result._unsafeUnwrap()).toEqual({ providerFeedbackId: "feedback_1" });
    expect(usedTokens).toEqual(["request-token"]);
  });

  test("[PG-PREVIEW-FEEDBACK-001] returns safe configuration error without a request or worker token", async () => {
    const writer = new ShellGitHubPreviewFeedbackWriter(new StubIntegrationAuthPort(null));

    const result = await writer.publish(
      createExecutionContext({
        entrypoint: "system",
        requestId: "req_preview_missing_feedback_token",
      }),
      previewFeedbackInput(),
    );

    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "preview-feedback",
        provider: "github",
      },
    });
    expect(JSON.stringify(result._unsafeUnwrapErr())).not.toContain("worker-token");
  });
});
