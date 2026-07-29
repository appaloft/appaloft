import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  createExecutionContext,
  type GitHubAgentTaskSummary,
  type GitHubAgentTrigger,
} from "@appaloft/application";

import { createGitHubAgentTaskFeedbackAdapter } from "../src";

const context = createExecutionContext({
  entrypoint: "system",
  requestId: "req_github_agent_feedback",
});

const trigger: GitHubAgentTrigger = {
  provider: "github",
  sourceEventId: "sevt_feedback",
  event: "issue_comment",
  action: "created",
  deliveryId: "delivery_feedback",
  installationId: "98765",
  repository: { id: "123456", fullName: "appaloft/agent-sandbox-smoke" },
  sender: { id: "303" },
  thread: { kind: "pull-request", number: 42 },
  commentId: "700",
  command: { kind: "review" },
  pullRequest: {
    number: 42,
    headSha: "abc123",
    baseRef: "main",
    headRepositoryId: "123456",
    headRepositoryFullName: "appaloft/agent-sandbox-smoke",
    fork: false,
  },
};

const queued: GitHubAgentTaskSummary = {
  taskId: "task_1",
  workspaceId: "workspace_1",
  activeRunId: "run_1",
  status: "queued",
  taskUrl: "https://appaloft.test/tasks/task_1",
  sessionRecovery: "new",
};

describe("GitHub Agent Task feedback adapter", () => {
  test("[GH-AUTO-FEEDBACK-013] acknowledges once and creates one bounded status comment and Check Run", async () => {
    const requests: Array<{
      url: string;
      method: string;
      body: unknown;
      authorization: string | null;
    }> = [];
    let id = 100;
    const adapter = createGitHubAgentTaskFeedbackAdapter(
      "installation-token",
      async (url, init) => {
        requests.push({
          url: String(url),
          method: init?.method ?? "GET",
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
          authorization: new Headers(init?.headers).get("authorization"),
        });
        id += 1;
        return new Response(JSON.stringify({ id }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      },
      "https://api.github.test",
    );

    const acknowledged = await adapter.acknowledge(context, { trigger });
    const updated = await adapter.update(context, {
      trigger,
      task: queued,
      existing: acknowledged._unsafeUnwrap(),
    });

    expect(updated._unsafeUnwrap()).toEqual({
      reactionId: "101",
      statusCommentId: "102",
      checkRunId: "103",
    });
    expect(requests.map(({ url, method }) => ({ url, method }))).toEqual([
      {
        url: "https://api.github.test/repos/appaloft/agent-sandbox-smoke/issues/comments/700/reactions",
        method: "POST",
      },
      {
        url: "https://api.github.test/repos/appaloft/agent-sandbox-smoke/issues/42/comments",
        method: "POST",
      },
      {
        url: "https://api.github.test/repos/appaloft/agent-sandbox-smoke/check-runs",
        method: "POST",
      },
    ]);
    expect(requests[2]?.body).toMatchObject({
      name: "Appaloft Agent Task",
      head_sha: "abc123",
      status: "queued",
      details_url: "https://appaloft.test/tasks/task_1",
    });
    expect(requests.every((request) => request.authorization === "Bearer installation-token")).toBe(
      true,
    );
    expect(JSON.stringify(updated._unsafeUnwrap())).not.toContain("installation-token");
  });

  test("[GH-AUTO-FEEDBACK-013] updates the same comment and Check Run without feedback spam", async () => {
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    const adapter = createGitHubAgentTaskFeedbackAdapter(
      "installation-token",
      async (url, init) => {
        requests.push({
          url: String(url),
          method: init?.method ?? "GET",
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
      "https://api.github.test",
    );

    const updated = await adapter.update(context, {
      trigger,
      task: {
        ...queued,
        status: "completed",
        sessionRecovery: "native",
        feedback: {
          phase: "delivery",
          checks: [
            { name: "unit tests", status: "passed", summary: "18 tests passed" },
            {
              name: "integration tests",
              status: "failed",
              summary: "token=github_pat_this-must-never-be-rendered",
            },
          ],
          diff: {
            stat: "2 files changed, 8 insertions(+), 1 deletion(-)",
            patch: "diff --git a/src/a.ts b/src/a.ts\n+export const compatible = true;",
            truncated: false,
            redacted: false,
          },
          preview: {
            url: "https://preview.appaloft.test/task-1",
            visibility: "private",
            expiresAt: "2026-07-30T00:00:00.000Z",
          },
          delivery: {
            kind: "pull-request",
            status: "delivered",
            url: "https://github.test/appaloft/repository/pull/43?token=delivery-secret",
          },
          cleanup: { workspace: "sleeping", preview: "active" },
        },
      },
      existing: {
        reactionId: "101",
        statusCommentId: "102",
        checkRunId: "103",
      },
    });

    expect(updated._unsafeUnwrap()).toEqual({
      reactionId: "101",
      statusCommentId: "102",
      checkRunId: "103",
    });
    expect(requests.map(({ url, method }) => ({ url, method }))).toEqual([
      {
        url: "https://api.github.test/repos/appaloft/agent-sandbox-smoke/issues/comments/102",
        method: "PATCH",
      },
      {
        url: "https://api.github.test/repos/appaloft/agent-sandbox-smoke/check-runs/103",
        method: "PATCH",
      },
    ]);
    expect(requests[1]?.body).toMatchObject({
      status: "completed",
      conclusion: "success",
    });
    const rendered = JSON.stringify(requests.map((request) => request.body));
    expect(rendered).toContain("### Checks");
    expect(rendered).toContain("18 tests passed");
    expect(rendered).toContain("### Diff");
    expect(rendered).toContain("### Preview");
    expect(rendered).toContain("### Delivery");
    expect(rendered).toContain("### Retention");
    expect(rendered).toContain("[REDACTED SECRET-LIKE OUTPUT]");
    expect(rendered).not.toContain("github_pat_this-must-never-be-rendered");
    expect(rendered).not.toContain("delivery-secret");
    expect(rendered.length).toBeLessThan(50_000);
  });

  test("[GH-AUTO-AUTHZ-008] denial exposes only an actionable reason and optional Connect Agent URL", async () => {
    const bodies: unknown[] = [];
    const adapter = createGitHubAgentTaskFeedbackAdapter(
      "installation-token",
      async (_url, init) => {
        bodies.push(init?.body ? JSON.parse(String(init.body)) : undefined);
        return new Response(JSON.stringify({ id: 104 }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      },
      "https://api.github.test",
    );

    const rejected = await adapter.reject(context, {
      trigger,
      reasonCode: "agent_credential_missing",
      message: "Connect an Agent credential before starting this task.",
      connectAgentUrl: "https://appaloft.test/settings/agent-credentials",
    });

    expect(rejected._unsafeUnwrap()).toEqual({ statusCommentId: "104" });
    expect(JSON.stringify(bodies)).toContain("Connect Agent");
    expect(JSON.stringify(bodies)).not.toContain("installation-token");
  });
});
