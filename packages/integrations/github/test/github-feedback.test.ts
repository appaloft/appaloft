import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { createExecutionContext } from "@appaloft/application";

import { createGitHubPreviewPrCommentFeedbackWriter } from "../src";

interface CapturedRequest {
  url: string;
  method: string;
  authorization: string | null;
  body: unknown;
}

function feedbackInput(input?: { providerFeedbackId?: string }) {
  return {
    feedbackKey: "feedback:sevt_preview_feedback_1:github-pr-comment",
    sourceEventId: "sevt_preview_feedback_1",
    previewEnvironmentId: "prenv_preview_feedback_1",
    channel: "github-pr-comment" as const,
    repositoryFullName: "appaloft/demo",
    pullRequestNumber: 42,
    body: "Preview feedback body",
    ...(input?.providerFeedbackId ? { providerFeedbackId: input.providerFeedbackId } : {}),
  };
}

describe("GitHub preview feedback writer", () => {
  test("[PG-PREVIEW-FEEDBACK-001] creates a pull request comment and returns the provider feedback id", async () => {
    const requests: CapturedRequest[] = [];
    const writer = createGitHubPreviewPrCommentFeedbackWriter(
      "github-token",
      async (input, init) => {
        requests.push({
          url: String(input),
          method: init?.method ?? "GET",
          authorization: new Headers(init?.headers).get("authorization"),
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        return new Response(JSON.stringify({ id: 100 }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      },
      "https://api.github.test",
    );

    const result = await writer.publish(
      createExecutionContext({ entrypoint: "system", requestId: "req_github_feedback_create" }),
      feedbackInput(),
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ providerFeedbackId: "100" });
    expect(requests).toEqual([
      {
        url: "https://api.github.test/repos/appaloft/demo/issues/42/comments",
        method: "POST",
        authorization: "Bearer github-token",
        body: { body: "Preview feedback body" },
      },
    ]);
    expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("github-token");
    expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("Preview feedback body");
  });

  test("[PG-PREVIEW-FEEDBACK-001] updates an existing pull request comment in place", async () => {
    const requests: CapturedRequest[] = [];
    const writer = createGitHubPreviewPrCommentFeedbackWriter(
      "github-token",
      async (input, init) => {
        requests.push({
          url: String(input),
          method: init?.method ?? "GET",
          authorization: new Headers(init?.headers).get("authorization"),
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        return new Response(JSON.stringify({ id: 100 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
      "https://api.github.test",
    );

    const result = await writer.publish(
      createExecutionContext({ entrypoint: "system", requestId: "req_github_feedback_update" }),
      feedbackInput({ providerFeedbackId: "100" }),
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ providerFeedbackId: "100" });
    expect(requests).toEqual([
      {
        url: "https://api.github.test/repos/appaloft/demo/issues/comments/100",
        method: "PATCH",
        authorization: "Bearer github-token",
        body: { body: "Preview feedback body" },
      },
    ]);
  });

  test("[PG-PREVIEW-FEEDBACK-001] returns safe retryable provider errors without response bodies or tokens", async () => {
    const writer = createGitHubPreviewPrCommentFeedbackWriter(
      "github-token",
      async () =>
        new Response(JSON.stringify({ message: "rate limited with provider body" }), {
          status: 429,
          headers: { "content-type": "application/json" },
        }),
      "https://api.github.test",
    );

    const result = await writer.publish(
      createExecutionContext({ entrypoint: "system", requestId: "req_github_feedback_error" }),
      feedbackInput(),
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "provider_error",
      category: "provider",
      retryable: true,
      details: {
        phase: "preview-feedback",
        provider: "github",
        channel: "github-pr-comment",
        statusCode: 429,
      },
    });
    expect(JSON.stringify(result._unsafeUnwrapErr())).not.toContain("github-token");
    expect(JSON.stringify(result._unsafeUnwrapErr())).not.toContain(
      "rate limited with provider body",
    );
    expect(JSON.stringify(result._unsafeUnwrapErr())).not.toContain("Preview feedback body");
  });

  test("[PG-PREVIEW-FEEDBACK-001] leaves checks and deployment statuses unsupported in the PR comment writer", async () => {
    const writer = createGitHubPreviewPrCommentFeedbackWriter(
      "github-token",
      async () => {
        throw new Error("fetch should not be called");
      },
      "https://api.github.test",
    );

    const result = await writer.publish(
      createExecutionContext({
        entrypoint: "system",
        requestId: "req_github_feedback_unsupported",
      }),
      {
        ...feedbackInput(),
        channel: "github-check",
      },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "provider_capability_unsupported",
      category: "provider",
      retryable: false,
      details: {
        phase: "preview-feedback",
        provider: "github",
        channel: "github-check",
      },
    });
  });
});
