import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { createExecutionContext, type GitHubAgentTrigger } from "@appaloft/application";

import { GitHubAgentReviewDeliveryAdapter } from "../src";

const context = createExecutionContext({
  entrypoint: "system",
  requestId: "req_github_review_delivery",
});

const trigger: GitHubAgentTrigger = {
  provider: "github",
  sourceEventId: "sevt_review",
  event: "issue_comment",
  action: "created",
  deliveryId: "delivery_review",
  installationId: "98765",
  repository: { id: "123456", fullName: "appaloft/agent-sandbox-smoke" },
  sender: { id: "303" },
  thread: { kind: "pull-request", number: 42 },
  command: { kind: "review" },
  pullRequest: {
    number: 42,
    headSha: "abcdef123456",
    baseRef: "main",
    headRepositoryId: "123456",
    headRepositoryFullName: "appaloft/agent-sandbox-smoke",
    fork: false,
  },
};

function fetchSequence(payloads: unknown[]) {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), ...(init ? { init } : {}) });
    const payload = payloads.shift();
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { fetcher, requests };
}

describe("GitHub Agent Review delivery", () => {
  test("[GH-AUTO-REVIEW-015] re-reads head and creates one digest-marked inline Review", async () => {
    const transport = fetchSequence([
      { head: { sha: "abcdef123456" } },
      [],
      { id: 7001, html_url: "https://github.test/review/7001" },
    ]);
    const adapter = new GitHubAgentReviewDeliveryAdapter("installation-token", transport.fetcher);
    const result = await adapter.submit(context, {
      trigger,
      expectedHeadSha: "abcdef123456",
      contentDigest: "sha256:review-content-001",
      summary: "One actionable compatibility finding.",
      findings: [
        {
          path: "src/api.ts",
          line: 18,
          body: "Preserve the existing response field.",
          severity: "warning",
        },
      ],
    });

    expect(result._unsafeUnwrap()).toEqual({
      reviewId: "7001",
      reviewUrl: "https://github.test/review/7001",
      duplicate: false,
    });
    expect(transport.requests).toHaveLength(3);
    const delivered = JSON.parse(String(transport.requests[2]?.init?.body));
    expect(delivered).toMatchObject({
      commit_id: "abcdef123456",
      event: "COMMENT",
      comments: [
        {
          path: "src/api.ts",
          line: 18,
          side: "RIGHT",
          body: "[warning] Preserve the existing response field.",
        },
      ],
    });
    expect(delivered.body).toContain("appaloft-agent-review:sha256:review-content-001");
    expect(JSON.stringify(delivered)).not.toContain("installation-token");
  });

  test("[GH-AUTO-REVIEW-015] returns the existing same-head digest Review without posting", async () => {
    const transport = fetchSequence([
      { head: { sha: "abcdef123456" } },
      [
        {
          id: 7001,
          commit_id: "abcdef123456",
          body: "<!-- appaloft-agent-review:sha256:review-content-001 -->",
        },
      ],
    ]);
    const result = await new GitHubAgentReviewDeliveryAdapter(
      "installation-token",
      transport.fetcher,
    ).submit(context, {
      trigger,
      expectedHeadSha: "abcdef123456",
      contentDigest: "sha256:review-content-001",
      summary: "No additional findings.",
      findings: [],
    });

    expect(result._unsafeUnwrap()).toEqual({ reviewId: "7001", duplicate: true });
    expect(transport.requests).toHaveLength(2);
  });

  test("[#984][GH-AUTO-REVIEW-015] delivers a projected Task link without treating its query as an environment assignment", async () => {
    const transport = fetchSequence([
      { head: { sha: "abcdef123456" } },
      [],
      { id: 7002, html_url: "https://github.test/review/7002" },
    ]);
    const result = await new GitHubAgentReviewDeliveryAdapter(
      "installation-token",
      transport.fetcher,
    ).submit(context, {
      trigger,
      expectedHeadSha: "abcdef123456",
      contentDigest: "sha256:review-content-002",
      summary:
        "Review completed without structured narrative output. [Open Task](https://appaloft.test/workspaces/sbx_alpha?task=srun_alpha)",
      findings: [],
    });

    expect(result._unsafeUnwrap()).toEqual({
      reviewId: "7002",
      reviewUrl: "https://github.test/review/7002",
      duplicate: false,
    });
    expect(transport.requests).toHaveLength(3);
  });

  test("[#986][GH-AUTO-REVIEW-015] redacts secret-like Review text before delivery", async () => {
    const transport = fetchSequence([
      { head: { sha: "abcdef123456" } },
      [],
      { id: 7003, html_url: "https://github.test/review/7003" },
    ]);
    const result = await new GitHubAgentReviewDeliveryAdapter(
      "installation-token",
      transport.fetcher,
    ).submit(context, {
      trigger,
      expectedHeadSha: "abcdef123456",
      contentDigest: "sha256:review-content-003",
      summary: "token=must-not-leave-the-task",
      findings: [
        {
          path: "src/api.ts",
          line: 18,
          body: "API_KEY=must-not-leave-the-finding",
          severity: "warning",
        },
      ],
    });

    expect(result._unsafeUnwrap()).toEqual({
      reviewId: "7003",
      reviewUrl: "https://github.test/review/7003",
      duplicate: false,
    });
    expect(transport.requests).toHaveLength(3);
    const delivered = String(transport.requests[2]?.init?.body);
    expect(delivered).toContain("[REDACTED SECRET-LIKE OUTPUT]");
    expect(delivered).not.toContain("must-not-leave-the-task");
    expect(delivered).not.toContain("must-not-leave-the-finding");
  });

  test("[GH-AUTO-HEAD-016] refuses to annotate a changed head", async () => {
    const transport = fetchSequence([{ head: { sha: "new-head-sha" } }]);
    const result = await new GitHubAgentReviewDeliveryAdapter(
      "installation-token",
      transport.fetcher,
    ).submit(context, {
      trigger,
      expectedHeadSha: "abcdef123456",
      contentDigest: "sha256:review-content-001",
      summary: "Review summary.",
      findings: [],
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "conflict",
      details: { phase: "github-agent-review-head-reconciliation" },
    });
    expect(transport.requests).toHaveLength(1);
  });
});
