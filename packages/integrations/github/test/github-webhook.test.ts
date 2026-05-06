import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { createExecutionContext } from "@appaloft/application";

import {
  createGitHubPreviewPullRequestWebhookVerifier,
  createGitHubSourceEventWebhookVerifier,
} from "../src/index";

async function hmacSha256Hex(secretValue: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretValue),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function githubPushPayload() {
  return {
    ref: "refs/heads/main",
    after: "f1e2d3c4",
    repository: {
      id: 123456,
      full_name: "appaloft/demo",
      html_url: "https://github.com/appaloft/demo",
      clone_url: "https://github.com/appaloft/demo.git",
    },
  };
}

function githubPullRequestPayload(action = "synchronize") {
  return {
    action,
    number: 42,
    repository: {
      id: 123456,
      full_name: "appaloft/demo",
      html_url: "https://github.com/appaloft/demo",
      clone_url: "https://github.com/appaloft/demo.git",
    },
    pull_request: {
      head: {
        sha: "f1e2d3c4",
        repo: {
          full_name: "appaloft/demo",
        },
      },
      base: {
        ref: "main",
      },
    },
  };
}

describe("GitHub source event webhook verifier", () => {
  test("[SRC-AUTO-EVENT-007] verifies GitHub push signatures and normalizes safe source event facts", async () => {
    const verifier = createGitHubSourceEventWebhookVerifier();
    const rawBody = JSON.stringify(githubPushPayload());
    const signature = await hmacSha256Hex("correct-secret", rawBody);

    const result = await verifier.verify(
      createExecutionContext({ entrypoint: "http", requestId: "req_github_webhook_test" }),
      {
        eventName: "push",
        deliveryId: "delivery_1",
        rawBody,
        signature: `sha256=${signature}`,
        secretValue: "correct-secret",
      },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      outcome: "source-event",
      sourceEvent: {
        sourceKind: "github",
        eventKind: "push",
        sourceIdentity: {
          locator: "https://github.com/appaloft/demo.git",
          providerRepositoryId: "123456",
          repositoryFullName: "appaloft/demo",
        },
        ref: "main",
        revision: "f1e2d3c4",
        deliveryId: "delivery_1",
        verification: {
          status: "verified",
          method: "provider-signature",
        },
      },
    });
    expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("correct-secret");
    expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("sha256=");
  });

  test("[SRC-AUTO-EVENT-008] rejects invalid signatures and unsafe payloads before normalization", async () => {
    const verifier = createGitHubSourceEventWebhookVerifier();
    const context = createExecutionContext({
      entrypoint: "http",
      requestId: "req_github_webhook_reject_test",
    });
    const rawBody = JSON.stringify(githubPushPayload());

    const invalidSignature = await verifier.verify(context, {
      eventName: "push",
      deliveryId: "delivery_invalid",
      rawBody,
      signature: "sha256=0000000000000000000000000000000000000000000000000000000000000000",
      secretValue: "correct-secret",
    });
    expect(invalidSignature.isErr()).toBe(true);
    expect(invalidSignature._unsafeUnwrapErr().code).toBe("source_event_signature_invalid");

    const unsafePayload = await verifier.verify(context, {
      eventName: "push",
      deliveryId: "delivery_unsafe",
      rawBody: JSON.stringify({ repository: { full_name: "appaloft/demo" } }),
      signature: `sha256=${await hmacSha256Hex(
        "correct-secret",
        JSON.stringify({ repository: { full_name: "appaloft/demo" } }),
      )}`,
      secretValue: "correct-secret",
    });
    expect(unsafePayload.isErr()).toBe(true);
    expect(unsafePayload._unsafeUnwrapErr().code).toBe("validation_error");
  });

  test("[SRC-AUTO-ENTRY-004] accepts verified GitHub ping deliveries as no-op", async () => {
    const verifier = createGitHubSourceEventWebhookVerifier();
    const rawBody = JSON.stringify({ zen: "Keep it logically awesome." });
    const signature = await hmacSha256Hex("correct-secret", rawBody);

    const result = await verifier.verify(
      createExecutionContext({ entrypoint: "http", requestId: "req_github_webhook_ping_test" }),
      {
        eventName: "ping",
        deliveryId: "delivery_ping",
        rawBody,
        signature: `sha256=${signature}`,
        secretValue: "correct-secret",
      },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      outcome: "noop",
    });
  });
});

describe("GitHub preview pull request webhook verifier", () => {
  test("[PG-PREVIEW-EVENT-001] verifies pull request signatures and normalizes safe preview facts", async () => {
    const verifier = createGitHubPreviewPullRequestWebhookVerifier();
    const rawBody = JSON.stringify(githubPullRequestPayload());
    const signature = await hmacSha256Hex("correct-secret", rawBody);

    const result = await verifier.verify(
      createExecutionContext({
        entrypoint: "http",
        requestId: "req_github_preview_webhook_test",
      }),
      {
        eventName: "pull_request",
        deliveryId: "delivery_preview_1",
        rawBody,
        signature: `sha256=${signature}`,
        secretValue: "correct-secret",
        receivedAt: "2026-05-06T03:00:00.000Z",
      },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      outcome: "preview-pull-request-event",
      previewEvent: {
        provider: "github",
        eventKind: "pull-request",
        eventAction: "synchronize",
        repositoryFullName: "appaloft/demo",
        headRepositoryFullName: "appaloft/demo",
        pullRequestNumber: 42,
        headSha: "f1e2d3c4",
        baseRef: "main",
        verified: true,
        deliveryId: "delivery_preview_1",
        receivedAt: "2026-05-06T03:00:00.000Z",
      },
    });
    expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("correct-secret");
    expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("sha256=");
    expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("pull_request");
  });

  test("[PG-PREVIEW-EVENT-001] rejects invalid preview signatures and unsupported actions safely", async () => {
    const verifier = createGitHubPreviewPullRequestWebhookVerifier();
    const context = createExecutionContext({
      entrypoint: "http",
      requestId: "req_github_preview_webhook_reject_test",
    });
    const rawBody = JSON.stringify(githubPullRequestPayload());

    const invalidSignature = await verifier.verify(context, {
      eventName: "pull_request",
      deliveryId: "delivery_preview_invalid",
      rawBody,
      signature: "sha256=0000000000000000000000000000000000000000000000000000000000000000",
      secretValue: "correct-secret",
    });
    expect(invalidSignature.isErr()).toBe(true);
    expect(invalidSignature._unsafeUnwrapErr().code).toBe("source_event_signature_invalid");

    const unsupportedRawBody = JSON.stringify(githubPullRequestPayload("labeled"));
    const unsupportedAction = await verifier.verify(context, {
      eventName: "pull_request",
      deliveryId: "delivery_preview_unsupported",
      rawBody: unsupportedRawBody,
      signature: `sha256=${await hmacSha256Hex("correct-secret", unsupportedRawBody)}`,
      secretValue: "correct-secret",
    });
    expect(unsupportedAction.isErr()).toBe(true);
    expect(unsupportedAction._unsafeUnwrapErr().code).toBe("source_event_unsupported_kind");

    const unsafeRawBody = JSON.stringify({ action: "opened", repository: { full_name: "x/y" } });
    const unsafePayload = await verifier.verify(context, {
      eventName: "pull_request",
      deliveryId: "delivery_preview_unsafe",
      rawBody: unsafeRawBody,
      signature: `sha256=${await hmacSha256Hex("correct-secret", unsafeRawBody)}`,
      secretValue: "correct-secret",
    });
    expect(unsafePayload.isErr()).toBe(true);
    expect(unsafePayload._unsafeUnwrapErr().code).toBe("validation_error");
  });
});
