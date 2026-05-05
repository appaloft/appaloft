import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { createExecutionContext } from "@appaloft/application";

import { createGitHubSourceEventWebhookVerifier } from "../src/index";

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
