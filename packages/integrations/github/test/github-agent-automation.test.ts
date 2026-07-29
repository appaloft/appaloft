import "reflect-metadata";
import { describe, expect, test } from "bun:test";

import {
  githubAgentSourceEventInput,
  githubAgentTriggerFromSourceEvent,
  parseAppaloftGitHubCommand,
  verifyAndNormalizeGitHubAgentWebhook,
} from "../src/index";

async function signature(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  return `sha256=${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function repository() {
  return {
    id: 123456,
    full_name: "appaloft/agent-sandbox-smoke",
    owner: { id: 101, login: "appaloft" },
    private: true,
    default_branch: "main",
  };
}

function sender() {
  return { id: 303, login: "octocat", type: "User" };
}

async function normalize(eventName: string, payload: Record<string, unknown>) {
  const rawBody = JSON.stringify({
    repository: repository(),
    installation: { id: 98765 },
    sender: sender(),
    ...payload,
  });
  return verifyAndNormalizeGitHubAgentWebhook({
    eventName,
    deliveryId: `delivery-${eventName}-${String(payload.action ?? "created")}`,
    rawBody,
    signature: await signature("webhook-secret", rawBody),
    secretValue: "webhook-secret",
    receivedAt: "2026-07-28T02:00:00.000Z",
  });
}

describe("GitHub Agent automation webhook", () => {
  test("[GH-AUTO-WEBHOOK-001] normalizes issue and PR comments using numeric identities", async () => {
    const issueComment = await normalize("issue_comment", {
      action: "created",
      issue: { number: 41 },
      comment: { id: 501, body: "@appaloft fix this and create a preview" },
    });
    const inlineComment = await normalize("pull_request_review_comment", {
      action: "created",
      pull_request: {
        number: 42,
        head: { sha: "abcdef123456", repo: { id: 123456, full_name: repository().full_name } },
        base: { ref: "main" },
      },
      comment: {
        id: 502,
        body: "@appaloft steer please keep the existing API compatible",
        path: "src/api.ts",
        line: 18,
      },
    });

    expect(issueComment._unsafeUnwrap()).toMatchObject({
      provider: "github",
      event: "issue_comment",
      action: "created",
      deliveryId: "delivery-issue_comment-created",
      installationId: "98765",
      repository: { id: "123456", fullName: "appaloft/agent-sandbox-smoke" },
      sender: { id: "303", loginSnapshot: "octocat", typeSnapshot: "User" },
      thread: { kind: "issue", number: 41 },
      comment: { id: "501", command: { kind: "fix", instruction: "this and create a preview" } },
    });
    expect(inlineComment._unsafeUnwrap()).toMatchObject({
      event: "pull_request_review_comment",
      thread: { kind: "pull-request", number: 42 },
      pullRequest: {
        number: 42,
        headSha: "abcdef123456",
        baseRef: "main",
        fork: false,
      },
      comment: {
        id: "502",
        path: "src/api.ts",
        line: 18,
        command: {
          kind: "steer",
          instruction: "please keep the existing API compatible",
        },
      },
    });
    const sourceEvent = githubAgentSourceEventInput(issueComment._unsafeUnwrap());
    expect(sourceEvent).toMatchObject({
      sourceKind: "github",
      eventKind: "issue_comment.created",
      deliveryId: "delivery-issue_comment-created",
      ref: "refs/issues/41",
      revision: "501",
      verification: { status: "verified", method: "provider-signature" },
    });
    expect(
      githubAgentTriggerFromSourceEvent(issueComment._unsafeUnwrap(), "sevt_issue_comment"),
    ).toMatchObject({
      sourceEventId: "sevt_issue_comment",
      deliveryId: "delivery-issue_comment-created",
      commentId: "501",
      command: { kind: "fix" },
    });
    expect(JSON.stringify(issueComment._unsafeUnwrap())).not.toContain("webhook-secret");
  });

  test("[GH-AUTO-WEBHOOK-001] normalizes labels and supported pull request actions", async () => {
    const issueLabel = await normalize("issues", {
      action: "labeled",
      issue: { number: 41 },
      label: { id: 77, name: "appaloft:fix" },
    });
    const ready = await normalize("pull_request", {
      action: "ready_for_review",
      number: 42,
      pull_request: {
        number: 42,
        head: { sha: "abcdef123456", repo: { id: 123456, full_name: repository().full_name } },
        base: { ref: "main" },
      },
    });

    expect(issueLabel._unsafeUnwrap()).toMatchObject({
      event: "issues",
      action: "labeled",
      thread: { kind: "issue", number: 41 },
      label: { id: "77", name: "appaloft:fix" },
    });
    expect(ready._unsafeUnwrap()).toMatchObject({
      event: "pull_request",
      action: "ready_for_review",
      thread: { kind: "pull-request", number: 42 },
      pullRequest: { headSha: "abcdef123456", fork: false },
    });

    const topLevelPullRequestComment = await normalize("issue_comment", {
      action: "created",
      issue: { number: 42, pull_request: { url: "https://api.github.test/pulls/42" } },
      comment: { id: 503, body: "@appaloft review" },
    });
    expect(topLevelPullRequestComment._unsafeUnwrap()).toMatchObject({
      event: "issue_comment",
      thread: { kind: "pull-request", number: 42 },
      comment: { command: { kind: "review" } },
    });

    for (const action of ["labeled", "synchronize", "closed"] as const) {
      const normalized = await normalize("pull_request", {
        action,
        number: 42,
        pull_request: {
          number: 42,
          head: { sha: "abcdef123456", repo: { id: 123456, full_name: repository().full_name } },
          base: { ref: "main" },
        },
        ...(action === "labeled" ? { label: { id: 78, name: "appaloft:review" } } : {}),
      });
      expect(normalized._unsafeUnwrap()).toMatchObject({
        event: "pull_request",
        action,
        thread: { kind: "pull-request", number: 42 },
        pullRequest: { headSha: "abcdef123456", fork: false },
      });
    }
  });

  test("[GH-AUTO-WEBHOOK-001] rejects an invalid signature, unsupported action, fork ambiguity, or missing numeric ids", async () => {
    const rawBody = JSON.stringify({
      action: "created",
      issue: { number: 41 },
      comment: { id: 501, body: "@appaloft status" },
      repository: repository(),
      installation: { id: 98765 },
      sender: sender(),
    });
    const invalidSignature = await verifyAndNormalizeGitHubAgentWebhook({
      eventName: "issue_comment",
      deliveryId: "delivery-invalid",
      rawBody,
      signature: "sha256=0".padEnd(71, "0"),
      secretValue: "webhook-secret",
    });
    const unsupported = await normalize("issue_comment", {
      action: "edited",
      issue: { number: 41 },
      comment: { id: 501, body: "@appaloft status" },
    });
    const missingNumericSender = await normalize("issue_comment", {
      action: "created",
      issue: { number: 41 },
      comment: { id: 501, body: "@appaloft status" },
      sender: { login: "mutable-name" },
    });

    expect(invalidSignature.isErr()).toBe(true);
    expect(unsupported.isErr()).toBe(true);
    expect(missingNumericSender.isErr()).toBe(true);
  });
});

describe("Appaloft GitHub command parser", () => {
  test("[GH-AUTO-COMMAND-002] parses the V1 command grammar", () => {
    expect(
      parseAppaloftGitHubCommand("@appaloft fix this and create a preview")._unsafeUnwrap(),
    ).toEqual({
      kind: "fix",
      instruction: "this and create a preview",
    });
    expect(parseAppaloftGitHubCommand("@appaloft review")._unsafeUnwrap()).toEqual({
      kind: "review",
    });
    expect(
      parseAppaloftGitHubCommand(
        "@appaloft steer please keep the existing API compatible",
      )._unsafeUnwrap(),
    ).toEqual({
      kind: "steer",
      instruction: "please keep the existing API compatible",
    });
    expect(
      parseAppaloftGitHubCommand("@appaloft new --profile safe-opencode")._unsafeUnwrap(),
    ).toEqual({
      kind: "new",
      profile: "safe-opencode",
    });
    for (const command of ["status", "stop", "resume"]) {
      expect(parseAppaloftGitHubCommand(`@appaloft ${command}`)._unsafeUnwrap()).toEqual({
        kind: command,
      });
    }
  });

  test("[GH-AUTO-COMMAND-002] rejects code blocks, multiple commands, unknown flags, env, credentials, and secret-looking text", () => {
    const rejected = [
      "```\n@appaloft fix\n```",
      "@appaloft status\n@appaloft stop",
      "@appaloft review --model secret-model",
      "@appaloft new --profile safe --credential conn_123",
      "@appaloft fix API_KEY=abc",
      "@appaloft steer use credentialConnectionId=conn_123",
      `@appaloft fix token=ghp_${"abcdefghijklmnopqrstuvwxyz123456"}`,
      "@appaloft status extra",
    ];

    for (const text of rejected) {
      expect(parseAppaloftGitHubCommand(text).isErr()).toBe(true);
    }
  });
});
