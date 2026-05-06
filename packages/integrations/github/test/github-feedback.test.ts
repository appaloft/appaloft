import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { createExecutionContext } from "@appaloft/application";

import {
  createGitHubPreviewCheckRunFeedbackWriter,
  createGitHubPreviewDeploymentStatusFeedbackWriter,
  createGitHubPreviewFeedbackWriter,
  createGitHubPreviewPrCommentFeedbackWriter,
} from "../src";

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

function checkInput(input?: { providerFeedbackId?: string }) {
  return {
    ...feedbackInput(input),
    feedbackKey: "feedback:sevt_preview_feedback_1:github-check",
    channel: "github-check" as const,
  };
}

function deploymentStatusInput(input?: {
  providerDeploymentId?: string;
  providerFeedbackId?: string;
}) {
  return {
    ...feedbackInput(),
    feedbackKey: "feedback:sevt_preview_feedback_1:github-deployment-status",
    channel: "github-deployment-status" as const,
    ...(input?.providerDeploymentId ? { providerDeploymentId: input.providerDeploymentId } : {}),
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

  test("[PG-PREVIEW-FEEDBACK-001] creates a check run for preview feedback", async () => {
    const requests: CapturedRequest[] = [];
    const writer = createGitHubPreviewCheckRunFeedbackWriter(
      "github-token",
      async (input, init) => {
        requests.push({
          url: String(input),
          method: init?.method ?? "GET",
          authorization: new Headers(init?.headers).get("authorization"),
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });

        if (String(input).endsWith("/repos/appaloft/demo/pulls/42")) {
          return new Response(JSON.stringify({ head: { sha: "abc1234" } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ id: 200 }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      },
      "https://api.github.test",
    );

    const result = await writer.publish(
      createExecutionContext({ entrypoint: "system", requestId: "req_github_check_create" }),
      checkInput(),
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ providerFeedbackId: "200" });
    expect(requests).toEqual([
      {
        url: "https://api.github.test/repos/appaloft/demo/pulls/42",
        method: "GET",
        authorization: "Bearer github-token",
        body: null,
      },
      {
        url: "https://api.github.test/repos/appaloft/demo/check-runs",
        method: "POST",
        authorization: "Bearer github-token",
        body: {
          name: "Appaloft preview",
          head_sha: "abc1234",
          status: "completed",
          conclusion: "success",
          output: {
            title: "Preview deployment accepted",
            summary: "Preview feedback body",
          },
        },
      },
    ]);
    expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("github-token");
    expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("Preview feedback body");
  });

  test("[PG-PREVIEW-FEEDBACK-001] updates an existing check run in place", async () => {
    const requests: CapturedRequest[] = [];
    const writer = createGitHubPreviewCheckRunFeedbackWriter(
      "github-token",
      async (input, init) => {
        requests.push({
          url: String(input),
          method: init?.method ?? "GET",
          authorization: new Headers(init?.headers).get("authorization"),
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        return new Response(JSON.stringify({ id: 200 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
      "https://api.github.test",
    );

    const result = await writer.publish(
      createExecutionContext({ entrypoint: "system", requestId: "req_github_check_update" }),
      checkInput({ providerFeedbackId: "200" }),
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ providerFeedbackId: "200" });
    expect(requests).toEqual([
      {
        url: "https://api.github.test/repos/appaloft/demo/check-runs/200",
        method: "PATCH",
        authorization: "Bearer github-token",
        body: {
          name: "Appaloft preview",
          status: "completed",
          conclusion: "success",
          output: {
            title: "Preview deployment accepted",
            summary: "Preview feedback body",
          },
        },
      },
    ]);
  });

  test("[PG-PREVIEW-FEEDBACK-001] returns safe retryable check run errors", async () => {
    const writer = createGitHubPreviewCheckRunFeedbackWriter(
      "github-token",
      async (input) => {
        if (String(input).endsWith("/repos/appaloft/demo/pulls/42")) {
          return new Response(JSON.stringify({ head: { sha: "abc1234" } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ message: "provider check body" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      },
      "https://api.github.test",
    );

    const result = await writer.publish(
      createExecutionContext({ entrypoint: "system", requestId: "req_github_check_error" }),
      checkInput(),
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "provider_error",
      category: "provider",
      retryable: true,
      details: {
        phase: "preview-feedback",
        provider: "github",
        channel: "github-check",
        statusCode: 500,
      },
    });
    expect(JSON.stringify(result._unsafeUnwrapErr())).not.toContain("github-token");
    expect(JSON.stringify(result._unsafeUnwrapErr())).not.toContain("provider check body");
    expect(JSON.stringify(result._unsafeUnwrapErr())).not.toContain("Preview feedback body");
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

  test("[PG-PREVIEW-FEEDBACK-001] creates a deployment status for preview feedback", async () => {
    const requests: CapturedRequest[] = [];
    const writer = createGitHubPreviewDeploymentStatusFeedbackWriter(
      "github-token",
      async (input, init) => {
        requests.push({
          url: String(input),
          method: init?.method ?? "GET",
          authorization: new Headers(init?.headers).get("authorization"),
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        return new Response(JSON.stringify({ id: 300 }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      },
      "https://api.github.test",
    );

    const result = await writer.publish(
      createExecutionContext({
        entrypoint: "system",
        requestId: "req_github_deployment_status_create",
      }),
      deploymentStatusInput({ providerDeploymentId: "github_deployment_300" }),
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ providerFeedbackId: "github_deployment_300" });
    expect(requests).toEqual([
      {
        url: "https://api.github.test/repos/appaloft/demo/deployments/github_deployment_300/statuses",
        method: "POST",
        authorization: "Bearer github-token",
        body: {
          state: "success",
          description: "Appaloft preview deployment accepted",
          environment: "preview",
          auto_inactive: false,
        },
      },
    ]);
    expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("github-token");
    expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("Preview feedback body");
  });

  test("[PG-PREVIEW-FEEDBACK-001] creates a GitHub deployment before automatic deployment status feedback", async () => {
    const requests: CapturedRequest[] = [];
    const writer = createGitHubPreviewDeploymentStatusFeedbackWriter(
      "github-token",
      async (input, init) => {
        requests.push({
          url: String(input),
          method: init?.method ?? "GET",
          authorization: new Headers(init?.headers).get("authorization"),
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });

        if (String(input).endsWith("/repos/appaloft/demo/pulls/42")) {
          return new Response(JSON.stringify({ head: { sha: "abc1234" } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        if (String(input).endsWith("/repos/appaloft/demo/deployments")) {
          return new Response(JSON.stringify({ id: "github_deployment_301" }), {
            status: 201,
            headers: { "content-type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ id: 302 }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      },
      "https://api.github.test",
    );

    const result = await writer.publish(
      createExecutionContext({
        entrypoint: "system",
        requestId: "req_github_deployment_status_auto_create",
      }),
      deploymentStatusInput(),
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ providerFeedbackId: "github_deployment_301" });
    expect(requests).toEqual([
      {
        url: "https://api.github.test/repos/appaloft/demo/pulls/42",
        method: "GET",
        authorization: "Bearer github-token",
        body: null,
      },
      {
        url: "https://api.github.test/repos/appaloft/demo/deployments",
        method: "POST",
        authorization: "Bearer github-token",
        body: {
          ref: "abc1234",
          environment: "preview",
          description: "Appaloft preview deployment",
          auto_merge: false,
          required_contexts: [],
          transient_environment: true,
          production_environment: false,
        },
      },
      {
        url: "https://api.github.test/repos/appaloft/demo/deployments/github_deployment_301/statuses",
        method: "POST",
        authorization: "Bearer github-token",
        body: {
          state: "success",
          description: "Appaloft preview deployment accepted",
          environment: "preview",
          auto_inactive: false,
        },
      },
    ]);
    expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("github-token");
    expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("Preview feedback body");
  });

  test("[PG-PREVIEW-FEEDBACK-001] reuses an existing deployment id for status updates", async () => {
    const requests: CapturedRequest[] = [];
    const writer = createGitHubPreviewDeploymentStatusFeedbackWriter(
      "github-token",
      async (input, init) => {
        requests.push({
          url: String(input),
          method: init?.method ?? "GET",
          authorization: new Headers(init?.headers).get("authorization"),
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        return new Response(JSON.stringify({ id: 301 }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      },
      "https://api.github.test",
    );

    const result = await writer.publish(
      createExecutionContext({
        entrypoint: "system",
        requestId: "req_github_deployment_status_update",
      }),
      deploymentStatusInput({ providerFeedbackId: "github_deployment_300" }),
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ providerFeedbackId: "github_deployment_300" });
    expect(requests.map((request) => request.url)).toEqual([
      "https://api.github.test/repos/appaloft/demo/deployments/github_deployment_300/statuses",
    ]);
  });

  test("[PG-PREVIEW-FEEDBACK-001] returns safe retryable deployment status errors", async () => {
    const writer = createGitHubPreviewDeploymentStatusFeedbackWriter(
      "github-token",
      async () =>
        new Response(JSON.stringify({ message: "provider deployment status body" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
      "https://api.github.test",
    );

    const result = await writer.publish(
      createExecutionContext({
        entrypoint: "system",
        requestId: "req_github_deployment_status_error",
      }),
      deploymentStatusInput({ providerDeploymentId: "github_deployment_300" }),
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "provider_error",
      category: "provider",
      retryable: true,
      details: {
        phase: "preview-feedback",
        provider: "github",
        channel: "github-deployment-status",
        statusCode: 503,
      },
    });
    expect(JSON.stringify(result._unsafeUnwrapErr())).not.toContain("github-token");
    expect(JSON.stringify(result._unsafeUnwrapErr())).not.toContain(
      "provider deployment status body",
    );
    expect(JSON.stringify(result._unsafeUnwrapErr())).not.toContain("Preview feedback body");
  });

  test("[PG-PREVIEW-FEEDBACK-001] routes comments, checks, and deployment statuses through the composite writer", async () => {
    const requests: CapturedRequest[] = [];
    const writer = createGitHubPreviewFeedbackWriter(
      "github-token",
      async (input, init) => {
        requests.push({
          url: String(input),
          method: init?.method ?? "GET",
          authorization: new Headers(init?.headers).get("authorization"),
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });

        if (String(input).endsWith("/repos/appaloft/demo/pulls/42")) {
          return new Response(JSON.stringify({ head: { sha: "abc1234" } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ id: requests.length === 1 ? 100 : 200 }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      },
      "https://api.github.test",
    );

    const comment = await writer.publish(
      createExecutionContext({ entrypoint: "system", requestId: "req_github_composite_comment" }),
      feedbackInput(),
    );
    const check = await writer.publish(
      createExecutionContext({ entrypoint: "system", requestId: "req_github_composite_check" }),
      checkInput(),
    );
    const deploymentStatus = await writer.publish(
      createExecutionContext({
        entrypoint: "system",
        requestId: "req_github_composite_deployment_status",
      }),
      deploymentStatusInput({ providerDeploymentId: "github_deployment_300" }),
    );

    expect(comment.isOk()).toBe(true);
    expect(check.isOk()).toBe(true);
    expect(deploymentStatus.isOk()).toBe(true);
    expect(comment._unsafeUnwrap()).toEqual({ providerFeedbackId: "100" });
    expect(check._unsafeUnwrap()).toEqual({ providerFeedbackId: "200" });
    expect(deploymentStatus._unsafeUnwrap()).toEqual({
      providerFeedbackId: "github_deployment_300",
    });
    expect(requests.map((request) => request.url)).toEqual([
      "https://api.github.test/repos/appaloft/demo/issues/42/comments",
      "https://api.github.test/repos/appaloft/demo/pulls/42",
      "https://api.github.test/repos/appaloft/demo/check-runs",
      "https://api.github.test/repos/appaloft/demo/deployments/github_deployment_300/statuses",
    ]);
  });
});
