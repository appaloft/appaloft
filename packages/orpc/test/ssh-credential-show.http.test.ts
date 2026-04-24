import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  type Query,
  type QueryBus,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";
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
      requestId: input.requestId ?? "req_orpc_ssh_credential_show_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

function credentialDetail() {
  return {
    schemaVersion: "credentials.show/v1",
    credential: {
      id: "cred_primary",
      name: "primary-key",
      kind: "ssh-private-key",
      username: "deploy",
      publicKeyConfigured: true,
      privateKeyConfigured: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    usage: {
      totalServers: 1,
      activeServers: 1,
      inactiveServers: 0,
      servers: [
        {
          serverId: "srv_primary",
          serverName: "Primary",
          lifecycleStatus: "active",
          providerKey: "generic-ssh",
          host: "203.0.113.10",
          username: "deploy",
        },
      ],
    },
    generatedAt: "2026-01-01T00:00:10.000Z",
  };
}

describe("SSH credential show HTTP route", () => {
  test("[SSH-CRED-ENTRY-003] dispatches ShowSshCredentialQuery through HTTP", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok(credentialDetail() as T);
      },
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/credentials/ssh/cred_primary?includeUsage=true", {
        method: "GET",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "credentials.show/v1",
      credential: {
        id: "cred_primary",
      },
      usage: {
        totalServers: 1,
      },
    });

    const application = (await import("@appaloft/application")) as Record<string, unknown>;
    const ShowSshCredentialQuery = application.ShowSshCredentialQuery as
      | (new (
          ...args: never[]
        ) => Query<unknown>)
      | undefined;
    expect(ShowSshCredentialQuery, "ShowSshCredentialQuery export").toBeDefined();
    if (!ShowSshCredentialQuery) {
      throw new Error("ShowSshCredentialQuery is not exported yet");
    }
    expect(capturedQuery).toBeInstanceOf(ShowSshCredentialQuery);
    expect(capturedQuery).toMatchObject({
      credentialId: "cred_primary",
      includeUsage: true,
    });
  });
});
