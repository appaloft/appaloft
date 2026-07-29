import { describe, expect, test } from "bun:test";
import {
  type AgentTaskRunDescriptor,
  projectAgentTaskRunToGitHubTaskSummary,
  projectGitHubAgentReviewFromTaskEvents,
  renderGitHubAgentPullRequestBody,
} from "../src";

function task(): AgentTaskRunDescriptor {
  return {
    taskRunId: "task_1",
    workspaceId: "workspace_1",
    activeRunId: "run_2",
    status: "delivered",
    sessionRecovery: "native",
    checks: [
      { name: "tests", status: "passed", output: "42 passed", redacted: false },
      { name: "TOKEN=secret", status: "failed", output: "API_KEY=secret", redacted: false },
    ],
    changes: {
      stat: "1 file changed",
      patch: "diff --git a/a.ts b/a.ts",
      truncated: false,
      redacted: false,
    },
    developmentPreview: {
      url: "https://preview.example.test",
      visibility: "private",
      expiresAt: "2026-07-30T00:00:00.000Z",
    },
    delivery: {
      pullRequestUrl: "https://github.com/appaloft/example/pull/1",
    },
  } as AgentTaskRunDescriptor;
}

describe("GitHub Agent delivery projection", () => {
  test("[GH-AUTO-BOUNDARY-021] projects bounded Task evidence through one public seam", () => {
    const summary = projectAgentTaskRunToGitHubTaskSummary(task(), {
      taskUrl: "https://appaloft.test/tasks/task_1",
    });

    expect(summary).toMatchObject({
      taskId: "task_1",
      workspaceId: "workspace_1",
      activeRunId: "run_2",
      status: "completed",
      feedback: {
        phase: "delivered",
        diff: { stat: "1 file changed" },
        preview: { visibility: "private" },
        delivery: { kind: "pull-request", status: "delivered" },
      },
    });
    expect(JSON.stringify(summary)).not.toContain("API_KEY=secret");
    expect(JSON.stringify(summary)).not.toContain("TOKEN=secret");
  });

  test("[GH-AUTO-BOUNDARY-021] projects Review findings and PR body without hosted rendering policy", () => {
    const review = projectGitHubAgentReviewFromTaskEvents(
      [
        {
          type: "agent.output",
          data: {
            summary: "Keep the API compatible.",
            findings: [
              {
                path: "src/api.ts",
                line: 18,
                body: "Preserve the old field.",
                severity: "warning",
              },
            ],
          },
        },
      ],
      "https://appaloft.test/tasks/task_1",
    );
    const body = renderGitHubAgentPullRequestBody({
      trigger: {
        provider: "github",
        sourceEventId: "sevt_1",
        event: "issue_comment",
        action: "created",
        deliveryId: "delivery_1",
        installationId: "98765",
        repository: { id: "123456", fullName: "appaloft/example" },
        sender: { id: "303" },
        thread: { kind: "issue", number: 41 },
      },
      task: task(),
      taskUrl: "https://appaloft.test/tasks/task_1",
    });

    expect(review).toMatchObject({
      summary: "Keep the API compatible.",
      findings: [{ path: "src/api.ts", line: 18, severity: "warning" }],
    });
    expect(body).toContain("Source: issue #41");
    expect(body).toContain("This pull request is not automatically merged.");
  });
});
