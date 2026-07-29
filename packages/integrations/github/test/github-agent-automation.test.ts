import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { createExecutionContext } from "@appaloft/application";

import {
  GitHubAgentTriggerSourceResolverAdapter,
  GitHubApiRepositoryPermissionReader,
  githubAgentSourceEventInput,
  githubAgentTriggerFromSourceEvent,
  parseAppaloftGitHubCommand,
  verifyAndNormalizeGitHubAgentWebhook,
  verifyGitHubWebhookSignature,
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
  test("[GH-AUTO-BOUNDARY-021] repository actor readback is a public GitHub adapter", async () => {
    const requests: string[] = [];
    const reader = new GitHubApiRepositoryPermissionReader(
      async () => "installation-token",
      (async (input: URL | RequestInfo) => {
        const url = String(input);
        requests.push(url);
        if (url.endsWith("/user/303")) {
          return Response.json({ id: 303, login: "octocat" });
        }
        if (url.endsWith("/repos/appaloft/agent-sandbox-smoke/collaborators/octocat/permission")) {
          return Response.json({ permission: "write" });
        }
        if (url.endsWith("/orgs/appaloft/members/octocat")) {
          return new Response(null, { status: 204 });
        }
        return new Response(null, { status: 404 });
      }) as typeof fetch,
    );

    const readback = await reader.read({
      installationId: "98765",
      repositoryFullName: "appaloft/agent-sandbox-smoke",
      githubUserId: "303",
    });

    expect(readback._unsafeUnwrap()).toEqual({
      githubUserId: "303",
      loginSnapshot: "octocat",
      permission: "push",
      organizationMember: true,
    });
    expect(requests).toHaveLength(3);
  });

  test("[GH-AUTO-BOUNDARY-021] generic GitHub signature verification is the shared ingress seam", async () => {
    const rawBody = JSON.stringify({ installation: { id: 98765 }, action: "created" });
    const verified = await verifyGitHubWebhookSignature({
      rawBody,
      signature: await signature("webhook-secret", rawBody),
      secretValue: "webhook-secret",
      eventName: "installation",
      deliveryId: "delivery-installation",
    });
    const denied = await verifyGitHubWebhookSignature({
      rawBody,
      signature: "sha256=0".padEnd(71, "0"),
      secretValue: "webhook-secret",
      eventName: "installation",
      deliveryId: "delivery-installation-invalid",
    });

    expect(verified._unsafeUnwrap()).toBeUndefined();
    expect(denied.isErr()).toBe(true);
  });

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
        head: {
          sha: "abcdef123456abcdef123456abcdef123456abcd",
          repo: { id: 123456, full_name: repository().full_name },
        },
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
        headSha: "abcdef123456abcdef123456abcdef123456abcd",
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
        head: {
          sha: "abcdef123456abcdef123456abcdef123456abcd",
          repo: { id: 123456, full_name: repository().full_name },
        },
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
      pullRequest: { headSha: "abcdef123456abcdef123456abcdef123456abcd", fork: false },
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
          head: {
            sha: "abcdef123456abcdef123456abcdef123456abcd",
            repo: { id: 123456, full_name: repository().full_name },
          },
          base: { ref: "main" },
        },
        ...(action === "labeled" ? { label: { id: 78, name: "appaloft:review" } } : {}),
      });
      expect(normalized._unsafeUnwrap()).toMatchObject({
        event: "pull_request",
        action,
        thread: { kind: "pull-request", number: 42 },
        pullRequest: { headSha: "abcdef123456abcdef123456abcdef123456abcd", fork: false },
      });
    }
  });

  test("[GH-AUTO-BOUNDARY-021][GH-AUTO-AUTHZ-005] resolves exact issue and PR source pins before authorization", async () => {
    const resolver = new GitHubAgentTriggerSourceResolverAdapter(
      async () => "installation-token",
      (async (input: URL | RequestInfo) => {
        const url = String(input);
        if (url.endsWith("/commits/main")) {
          return Response.json({ sha: "a".repeat(40) });
        }
        if (url.endsWith("/pulls/42")) {
          return Response.json({
            number: 42,
            head: {
              sha: "b".repeat(40),
              repo: { id: 999999, full_name: "outside/fork" },
            },
            base: { ref: "main" },
          });
        }
        return new Response(null, { status: 404 });
      }) as typeof fetch,
      "https://api.github.test",
    );
    const issue = githubAgentTriggerFromSourceEvent(
      (
        await normalize("issue_comment", {
          action: "created",
          issue: { number: 41 },
          comment: { id: 501, body: "@appaloft fix" },
        })
      )._unsafeUnwrap(),
      "sevt_issue",
    );
    const pullRequest = githubAgentTriggerFromSourceEvent(
      (
        await normalize("issue_comment", {
          action: "created",
          issue: { number: 42, pull_request: { url: "https://api.github.test/pulls/42" } },
          comment: { id: 502, body: "@appaloft review" },
        })
      )._unsafeUnwrap(),
      "sevt_pr",
    );

    const context = createExecutionContext({
      entrypoint: "worker",
      requestId: "req_source_pin",
    });
    const issueResolved = await resolver.resolve(context, {
      trigger: issue,
      intent: { action: "fix", source: "manual", mode: "write" },
    });
    const pullRequestResolved = await resolver.resolve(context, {
      trigger: pullRequest,
      intent: { action: "review", source: "manual", mode: "review-only" },
    });

    expect(issueResolved._unsafeUnwrap()).toMatchObject({
      repository: { defaultBranch: "main" },
      source: { ref: "main", headSha: "a".repeat(40) },
    });
    expect(pullRequestResolved._unsafeUnwrap()).toMatchObject({
      pullRequest: {
        number: 42,
        headSha: "b".repeat(40),
        headRepositoryId: "999999",
        headRepositoryFullName: "outside/fork",
        fork: true,
      },
      source: { ref: "b".repeat(40), headSha: "b".repeat(40) },
    });
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
