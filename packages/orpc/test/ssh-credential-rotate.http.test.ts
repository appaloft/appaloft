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
  RotateSshCredentialCommand,
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
      requestId: input.requestId ?? "req_orpc_ssh_credential_rotate_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

describe("SSH credential rotate HTTP route", () => {
  test("[SSH-CRED-ENTRY-013] dispatches RotateSshCredentialCommand through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          schemaVersion: "credentials.rotate-ssh/v1",
          credential: {
            id: "cred_primary",
            kind: "ssh-private-key",
            usernameConfigured: true,
            publicKeyConfigured: true,
            privateKeyConfigured: true,
            rotatedAt: "2026-01-01T00:00:10.000Z",
          },
          affectedUsage: {
            totalServers: 0,
            activeServers: 0,
            inactiveServers: 0,
            servers: [],
          },
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
    });

    const response = await app.handle(
      new Request("http://localhost/api/credentials/ssh/cred_primary/rotate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          privateKey: "NEW_PRIVATE",
          publicKey: "ssh-ed25519 NEW_PUBLIC",
          username: "deploy-new",
          confirmation: {
            credentialId: "cred_primary",
            acknowledgeServerUsage: true,
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      schemaVersion: "credentials.rotate-ssh/v1",
      credential: {
        id: "cred_primary",
        kind: "ssh-private-key",
        usernameConfigured: true,
        publicKeyConfigured: true,
        privateKeyConfigured: true,
        rotatedAt: "2026-01-01T00:00:10.000Z",
      },
      affectedUsage: {
        totalServers: 0,
        activeServers: 0,
        inactiveServers: 0,
        servers: [],
      },
    });
    expect(capturedCommand).toBeInstanceOf(RotateSshCredentialCommand);
    expect(capturedCommand).toMatchObject({
      credentialId: "cred_primary",
      privateKey: "NEW_PRIVATE",
      publicKey: "ssh-ed25519 NEW_PUBLIC",
      username: "deploy-new",
      confirmation: {
        credentialId: "cred_primary",
        acknowledgeServerUsage: true,
      },
    });
  });
});
