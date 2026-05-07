import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  type GitHubPreviewPullRequestWebhookVerifier,
  IngestPreviewPullRequestEventCommand,
  type Query,
  type QueryBus,
  type RepositoryContext,
  type SourceEventPolicyCandidate,
  type SourceEventPolicyReader,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";
import { createGitHubPreviewPullRequestWebhookVerifier } from "@appaloft/integration-github";
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
      requestId: input.requestId ?? "req_orpc_preview_github_pull_request_test",
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

function githubPullRequestPayload() {
  return {
    action: "synchronize",
    number: 42,
    repository: {
      id: 123456,
      full_name: "appaloft/demo",
      html_url: "https://github.com/appaloft/demo",
      clone_url: "https://github.com/appaloft/demo.git",
    },
    installation: {
      id: 98765,
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

function createApp(input: {
  commandBus?: CommandBus;
  githubWebhookSecret?: string;
  githubPreviewPullRequestWebhookVerifier?: GitHubPreviewPullRequestWebhookVerifier;
  sourceEventPolicyReader?: SourceEventPolicyReader;
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
    githubPreviewPullRequestWebhookVerifier:
      input.githubPreviewPullRequestWebhookVerifier ??
      createGitHubPreviewPullRequestWebhookVerifier(),
    ...(input.githubWebhookSecret ? { githubWebhookSecret: input.githubWebhookSecret } : {}),
    logger: new NoopLogger(),
    queryBus,
    ...(input.sourceEventPolicyReader
      ? { sourceEventPolicyReader: input.sourceEventPolicyReader }
      : {}),
  });
}

class MemorySourceEventPolicyReader implements SourceEventPolicyReader {
  constructor(private readonly candidates: SourceEventPolicyCandidate[]) {}

  async listCandidates(
    _context: RepositoryContext,
    _input: Parameters<SourceEventPolicyReader["listCandidates"]>[1],
  ): Promise<SourceEventPolicyCandidate[]> {
    return this.candidates.map((candidate) => ({
      ...candidate,
      refs: [...candidate.refs],
      eventKinds: [...candidate.eventKinds],
      sourceBinding: { ...candidate.sourceBinding },
    }));
  }
}

describe("GitHub preview pull request HTTP route", () => {
  test("[PG-PREVIEW-EVENT-001] verifies GitHub pull request webhook and dispatches preview ingest", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          status: "routed",
          lifecycleResult: {
            status: "dispatched",
            sourceEventId: "sevt_preview_delivery_42",
            previewEnvironmentId: "prenv_preview_42",
            deploymentId: "dep_preview_42",
          },
        } as T);
      },
    } as CommandBus;
    const rawBody = JSON.stringify(githubPullRequestPayload());
    const signature = await hmacSha256Hex("correct-secret", rawBody);
    const app = createApp({ commandBus, githubWebhookSecret: "correct-secret" });

    const response = await app.handle(
      new Request("http://localhost/api/integrations/github/source-events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-appaloft-destination-id": "dst_preview",
          "x-appaloft-environment-id": "env_preview",
          "x-appaloft-project-id": "prj_preview",
          "x-appaloft-resource-id": "res_preview_api",
          "x-appaloft-server-id": "srv_preview",
          "x-appaloft-source-binding-fingerprint": "srcfp_preview_42",
          "x-github-delivery": "delivery-42",
          "x-github-event": "pull_request",
          "x-hub-signature-256": `sha256=${signature}`,
        },
        body: rawBody,
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "routed",
      lifecycleResult: {
        status: "dispatched",
        previewEnvironmentId: "prenv_preview_42",
        deploymentId: "dep_preview_42",
      },
    });
    expect(capturedCommand).toBeInstanceOf(IngestPreviewPullRequestEventCommand);
    const command = capturedCommand as IngestPreviewPullRequestEventCommand;
    expect(command).toMatchObject({
      sourceEventId: "sevt_preview_delivery_42",
      projectId: "prj_preview",
      environmentId: "env_preview",
      resourceId: "res_preview_api",
      serverId: "srv_preview",
      destinationId: "dst_preview",
      sourceBindingFingerprint: "srcfp_preview_42",
      event: {
        provider: "github",
        eventKind: "pull-request",
        eventAction: "synchronize",
        repositoryFullName: "appaloft/demo",
        providerRepositoryId: "123456",
        installationId: "98765",
        headRepositoryFullName: "appaloft/demo",
        pullRequestNumber: 42,
        headSha: "f1e2d3c4",
        baseRef: "main",
        verified: true,
        deliveryId: "delivery-42",
      },
    });
    const serializedCommand = JSON.stringify(command);
    expect(serializedCommand).not.toContain("correct-secret");
    expect(serializedCommand).not.toContain("sha256=");
  });

  test("[PG-PREVIEW-EVENT-001] maps GitHub repository events to preview context without trusted headers", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          status: "routed",
          lifecycleResult: {
            status: "dispatched",
            sourceEventId: "sevt_preview_delivery_42",
            previewEnvironmentId: "prenv_preview_42",
            deploymentId: "dep_preview_42",
          },
        } as T);
      },
    } as CommandBus;
    const rawBody = JSON.stringify(githubPullRequestPayload());
    const signature = await hmacSha256Hex("correct-secret", rawBody);
    const app = createApp({
      commandBus,
      githubWebhookSecret: "correct-secret",
      sourceEventPolicyReader: new MemorySourceEventPolicyReader([
        {
          projectId: "prj_mapped",
          environmentId: "env_mapped",
          resourceId: "res_mapped_api",
          serverId: "srv_mapped",
          destinationId: "dst_mapped",
          sourceBindingFingerprint: "srcfp_mapped_repo",
          status: "enabled",
          refs: ["main"],
          eventKinds: ["push"],
          sourceBinding: {
            locator: "https://github.com/appaloft/demo.git",
            providerRepositoryId: "123456",
            repositoryFullName: "appaloft/demo",
          },
        },
      ]),
    });

    const response = await app.handle(
      new Request("http://localhost/api/integrations/github/source-events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-github-delivery": "delivery-42",
          "x-github-event": "pull_request",
          "x-hub-signature-256": `sha256=${signature}`,
        },
        body: rawBody,
      }),
    );

    expect(response.status).toBe(200);
    expect(capturedCommand).toBeInstanceOf(IngestPreviewPullRequestEventCommand);
    expect(capturedCommand).toMatchObject({
      projectId: "prj_mapped",
      environmentId: "env_mapped",
      resourceId: "res_mapped_api",
      serverId: "srv_mapped",
      destinationId: "dst_mapped",
      sourceBindingFingerprint: "srcfp_mapped_repo",
      event: {
        repositoryFullName: "appaloft/demo",
        providerRepositoryId: "123456",
        installationId: "98765",
      },
    });
  });

  test("[PG-PREVIEW-EVENT-001] rejects partial trusted context instead of falling back to policy mapping", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ status: "routed" } as T);
      },
    } as CommandBus;
    const rawBody = JSON.stringify(githubPullRequestPayload());
    const signature = await hmacSha256Hex("correct-secret", rawBody);
    const app = createApp({
      commandBus,
      githubWebhookSecret: "correct-secret",
      sourceEventPolicyReader: new MemorySourceEventPolicyReader([
        {
          projectId: "prj_mapped",
          environmentId: "env_mapped",
          resourceId: "res_mapped_api",
          serverId: "srv_mapped",
          destinationId: "dst_mapped",
          sourceBindingFingerprint: "srcfp_mapped_repo",
          status: "enabled",
          refs: ["main"],
          eventKinds: ["push"],
          sourceBinding: {
            locator: "https://github.com/appaloft/demo.git",
            providerRepositoryId: "123456",
            repositoryFullName: "appaloft/demo",
          },
        },
      ]),
    });

    const response = await app.handle(
      new Request("http://localhost/api/integrations/github/source-events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-appaloft-project-id": "prj_partial",
          "x-github-delivery": "delivery-42",
          "x-github-event": "pull_request",
          "x-hub-signature-256": `sha256=${signature}`,
        },
        body: rawBody,
      }),
    );

    expect(response.status).toBe(400);
    expect(capturedCommand).toBeUndefined();
  });

  test("[PG-PREVIEW-EVENT-001] rejects missing preview context before dispatch", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({} as T);
      },
    } as CommandBus;
    const rawBody = JSON.stringify(githubPullRequestPayload());
    const signature = await hmacSha256Hex("correct-secret", rawBody);
    const app = createApp({ commandBus, githubWebhookSecret: "correct-secret" });

    const response = await app.handle(
      new Request("http://localhost/api/integrations/github/source-events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-github-delivery": "delivery-42",
          "x-github-event": "pull_request",
          "x-hub-signature-256": `sha256=${signature}`,
        },
        body: rawBody,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "validation_error",
        retryable: false,
      },
    });
    expect(capturedCommand).toBeUndefined();
  });
});
