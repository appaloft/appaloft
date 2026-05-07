import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  GenericSignedSourceEventVerifier,
  IngestSourceEventCommand,
  type Query,
  type QueryBus,
  type RepositoryContext,
  type ResourceRepository,
} from "@appaloft/application";
import {
  ConfigKey,
  ConfigValueText,
  CreatedAt,
  DisplayNameText,
  EnvironmentId,
  GitRefText,
  ok,
  ProjectId,
  Resource,
  ResourceAutoDeploySecretRef,
  ResourceAutoDeployTriggerKindValue,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  type Result,
  SourceEventKindValue,
  SourceKindValue,
  SourceLocator,
  UpdatedAt,
  VariableExposureValue,
  VariableKindValue,
} from "@appaloft/core";
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
      requestId: input.requestId ?? "req_orpc_source_event_generic_signed_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

class SingleResourceRepository implements ResourceRepository {
  constructor(private readonly resource: Resource) {}

  async findOne(
    _context: RepositoryContext,
    _spec: Parameters<ResourceRepository["findOne"]>[1],
  ): Promise<Resource | null> {
    return this.resource;
  }

  async upsert(): Promise<void> {}
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

function resourceWithGenericSignedPolicy(): Resource {
  const resource = Resource.create({
    id: ResourceId.rehydrate("res_web"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_prod"),
    name: ResourceName.rehydrate("web"),
    kind: ResourceKindValue.rehydrate("application"),
    sourceBinding: {
      kind: SourceKindValue.rehydrate("git-public"),
      locator: SourceLocator.rehydrate("https://github.com/appaloft/demo"),
      displayName: DisplayNameText.rehydrate("appaloft/demo"),
      gitRef: GitRefText.rehydrate("main"),
    },
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();

  resource
    .setVariable({
      key: ConfigKey.rehydrate("APPALOFT_WEBHOOK_SECRET"),
      value: ConfigValueText.rehydrate("correct-secret"),
      kind: VariableKindValue.rehydrate("secret"),
      exposure: VariableExposureValue.rehydrate("runtime"),
      isSecret: true,
      updatedAt: UpdatedAt.rehydrate("2026-01-01T00:00:01.000Z"),
    })
    ._unsafeUnwrap();
  resource
    .configureAutoDeployPolicy({
      triggerKind: ResourceAutoDeployTriggerKindValue.rehydrate("generic-signed-webhook"),
      refs: [GitRefText.rehydrate("main")],
      eventKinds: [SourceEventKindValue.rehydrate("push")],
      genericWebhookSecretRef: ResourceAutoDeploySecretRef.create(
        "resource-secret:APPALOFT_WEBHOOK_SECRET",
      )._unsafeUnwrap(),
      configuredAt: UpdatedAt.rehydrate("2026-01-01T00:00:02.000Z"),
    })
    ._unsafeUnwrap();

  return resource;
}

describe("generic signed source event HTTP route", () => {
  test("[SRC-AUTO-ENTRY-002] verifies Resource-scoped generic signed webhook and dispatches ingest", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          sourceEventId: "sevt_1",
          status: "accepted",
          matchedResourceIds: ["res_web"],
          createdDeploymentIds: [],
          ignoredReasons: [],
        } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
      resourceRepository: new SingleResourceRepository(resourceWithGenericSignedPolicy()),
      sourceEventVerificationPort: new GenericSignedSourceEventVerifier(),
    });
    const body = {
      eventKind: "push",
      sourceIdentity: {
        locator: "https://github.com/appaloft/demo",
        repositoryFullName: "appaloft/demo",
      },
      ref: "main",
      revision: "abc123",
      deliveryId: "delivery_1",
    };
    const rawBody = JSON.stringify(body);
    const signature = await hmacSha256Hex("correct-secret", rawBody);

    const response = await app.handle(
      new Request("http://localhost/api/resources/res_web/source-events/generic-signed", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-appaloft-signature": `sha256=${signature}`,
        },
        body: rawBody,
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      sourceEventId: "sevt_1",
      status: "accepted",
      matchedResourceIds: ["res_web"],
      createdDeploymentIds: [],
      ignoredReasons: [],
    });
    expect(capturedCommand).toBeInstanceOf(IngestSourceEventCommand);
    const command = capturedCommand as IngestSourceEventCommand;
    expect(command.scopeResourceId).toBe("res_web");
    expect(command.sourceKind).toBe("generic-signed");
    expect(command.verification).toEqual({
      status: "verified",
      method: "generic-hmac",
    });
    const serializedCommand = JSON.stringify(command);
    expect(serializedCommand).not.toContain("correct-secret");
    expect(serializedCommand).not.toContain("sha256=");
  });

  test("[SRC-AUTO-EVENT-004] rejects invalid generic signed webhook signatures before ingest", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({} as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
      resourceRepository: new SingleResourceRepository(resourceWithGenericSignedPolicy()),
      sourceEventVerificationPort: new GenericSignedSourceEventVerifier(),
    });
    const rawBody = JSON.stringify({
      eventKind: "push",
      sourceIdentity: {
        locator: "https://github.com/appaloft/demo",
        repositoryFullName: "appaloft/demo",
      },
      ref: "main",
      revision: "abc123",
      deliveryId: "delivery_invalid_signature",
    });

    const response = await app.handle(
      new Request("http://localhost/api/resources/res_web/source-events/generic-signed", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-appaloft-signature":
            "sha256=0000000000000000000000000000000000000000000000000000000000000000",
        },
        body: rawBody,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "source_event_signature_invalid",
        retryable: false,
      },
    });
    expect(capturedCommand).toBeUndefined();
  });
});
