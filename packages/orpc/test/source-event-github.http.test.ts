import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  type GitHubSourceEventWebhookVerifier,
  IngestSourceEventCommand,
  type Query,
  type QueryBus,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";
import { createGitHubSourceEventWebhookVerifier } from "@appaloft/integration-github";
import { Elysia } from "elysia";

import { mountAppaloftOrpcRoutes } from "../src";

class NoopLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class TestExecutionContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      requestId: input.requestId ?? "req_orpc_source_event_github_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

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
    after: "abc123",
    repository: {
      id: 123456,
      full_name: "appaloft/demo",
      html_url: "https://github.com/appaloft/demo",
      clone_url: "https://github.com/appaloft/demo.git",
    },
  };
}

function createApp(input: {
  commandBus?: CommandBus;
  githubWebhookSecret?: string;
  githubSourceEventWebhookVerifier?: GitHubSourceEventWebhookVerifier;
}) {
  const commandBus =
    input.commandBus ??
    ({
      execute: async <T>(): Promise<Result<T>> => ok({} as T),
    } as CommandBus);
  const queryBus = {
    execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
      ok({} as T),
  } as QueryBus;

  return mountAppaloftOrpcRoutes(new Elysia(), {
    commandBus,
    executionContextFactory: new TestExecutionContextFactory(),
    githubSourceEventWebhookVerifier:
      input.githubSourceEventWebhookVerifier ?? createGitHubSourceEventWebhookVerifier(),
    ...(input.githubWebhookSecret ? { githubWebhookSecret: input.githubWebhookSecret } : {}),
    logger: new NoopLogger(),
    queryBus,
  });
}

describe("GitHub source event HTTP route", () => {
  test("[SRC-AUTO-ENTRY-004] verifies GitHub push webhook and dispatches source event ingest", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          sourceEventId: "sevt_github_1",
          status: "accepted",
          matchedResourceIds: ["res_web", "res_worker"],
          createdDeploymentIds: ["dep_web", "dep_worker"],
          ignoredReasons: [],
        } as T);
      },
    } as CommandBus;
    const rawBody = JSON.stringify(githubPushPayload());
    const signature = await hmacSha256Hex("correct-secret", rawBody);
    const app = createApp({ commandBus, githubWebhookSecret: "correct-secret" });

    const response = await app.handle(
      new Request("http://localhost/api/integrations/github/source-events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-github-delivery": "delivery_1",
          "x-github-event": "push",
          "x-hub-signature-256": `sha256=${signature}`,
        },
        body: rawBody,
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      sourceEventId: "sevt_github_1",
      status: "accepted",
      matchedResourceIds: ["res_web", "res_worker"],
      createdDeploymentIds: ["dep_web", "dep_worker"],
      ignoredReasons: [],
    });
    expect(capturedCommand).toBeInstanceOf(IngestSourceEventCommand);
    const command = capturedCommand as IngestSourceEventCommand;
    expect(command.scopeResourceId).toBeUndefined();
    expect(command.sourceKind).toBe("github");
    expect(command.eventKind).toBe("push");
    expect(command.sourceIdentity).toEqual({
      locator: "https://github.com/appaloft/demo.git",
      providerRepositoryId: "123456",
      repositoryFullName: "appaloft/demo",
    });
    expect(command.ref).toBe("main");
    expect(command.revision).toBe("abc123");
    expect(command.deliveryId).toBe("delivery_1");
    expect(command.verification).toEqual({
      status: "verified",
      method: "provider-signature",
    });
    const serializedCommand = JSON.stringify(command);
    expect(serializedCommand).not.toContain("correct-secret");
    expect(serializedCommand).not.toContain("sha256=");
  });

  test("[SRC-AUTO-ENTRY-004] treats verified GitHub ping webhooks as no-op", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({} as T);
      },
    } as CommandBus;
    const rawBody = JSON.stringify({ zen: "Keep it logically awesome." });
    const signature = await hmacSha256Hex("correct-secret", rawBody);
    const app = createApp({ commandBus, githubWebhookSecret: "correct-secret" });

    const response = await app.handle(
      new Request("http://localhost/api/integrations/github/source-events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-github-delivery": "delivery_ping",
          "x-github-event": "ping",
          "x-hub-signature-256": `sha256=${signature}`,
        },
        body: rawBody,
      }),
    );

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(capturedCommand).toBeUndefined();
  });

  test("[SRC-AUTO-EVENT-008] rejects missing config and invalid signatures before dispatch", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({} as T);
      },
    } as CommandBus;
    const rawBody = JSON.stringify(githubPushPayload());

    const missingConfigResponse = await createApp({ commandBus }).handle(
      new Request("http://localhost/api/integrations/github/source-events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-github-delivery": "delivery_missing_config",
          "x-github-event": "push",
          "x-hub-signature-256":
            "sha256=0000000000000000000000000000000000000000000000000000000000000000",
        },
        body: rawBody,
      }),
    );

    expect(missingConfigResponse.status).toBe(503);
    expect(await missingConfigResponse.json()).toMatchObject({
      error: {
        code: "source_event_provider_webhook_not_configured",
        retryable: true,
      },
    });

    const invalidSignatureResponse = await createApp({
      commandBus,
      githubWebhookSecret: "correct-secret",
    }).handle(
      new Request("http://localhost/api/integrations/github/source-events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-github-delivery": "delivery_invalid_signature",
          "x-github-event": "push",
          "x-hub-signature-256":
            "sha256=0000000000000000000000000000000000000000000000000000000000000000",
        },
        body: rawBody,
      }),
    );

    expect(invalidSignatureResponse.status).toBe(400);
    expect(await invalidSignatureResponse.json()).toMatchObject({
      error: {
        code: "source_event_signature_invalid",
        retryable: false,
      },
    });
    expect(capturedCommand).toBeUndefined();
  });
});
