import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type ActionDeployTokenAuthorizationPort,
  type AppLogger,
  type CommandBus,
  createExecutionContext,
  type QueryBus,
} from "@appaloft/application";
import { resolveConfig } from "@appaloft/config";
import { ok } from "@appaloft/core";
import { type ActionSourcePackageConfigReader } from "@appaloft/orpc";
import { createHttpApp } from "../src";

class SilentLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

function createTestApp(input?: {
  actionDeployTokenAuthorizationPort?: ActionDeployTokenAuthorizationPort;
  actionSourcePackageConfigReader?: ActionSourcePackageConfigReader;
}) {
  return createHttpApp({
    config: resolveConfig({
      flags: {
        appVersion: "0.1.0-test",
        authProvider: "none",
        webStaticDir: "",
      },
    }),
    commandBus: {} as unknown as CommandBus,
    queryBus: {} as unknown as QueryBus,
    logger: new SilentLogger(),
    executionContextFactory: {
      create(contextInput) {
        return createExecutionContext(contextInput);
      },
    },
    ...(input?.actionSourcePackageConfigReader
      ? {
          actionSourcePackageConfigReader: input.actionSourcePackageConfigReader,
        }
      : {}),
    ...(input?.actionDeployTokenAuthorizationPort
      ? {
          actionDeployTokenAuthorizationPort: input.actionDeployTokenAuthorizationPort,
        }
      : {}),
  });
}

describe("HTTP version endpoint", () => {
  test("[CONTROL-PLANE-HANDSHAKE-013] advertises server config deploy only when a config reader is wired", async () => {
    const withoutReader = createTestApp();
    const withoutReaderResponse = await withoutReader.handle(
      new Request("http://localhost/api/version"),
    );

    expect(await withoutReaderResponse.json()).toMatchObject({
      features: {
        actionServerConfigDeploy: false,
        actionDeployTokenAuth: false,
        sourcePackages: true,
        serverSideConfigBootstrap: false,
      },
    });

    const withReader = createTestApp({
      actionSourcePackageConfigReader: {
        readConfig: async () => ok({ text: "runtime:\n  strategy: static\n" }),
      },
    });
    const withReaderResponse = await withReader.handle(new Request("http://localhost/api/version"));

    expect(await withReaderResponse.json()).toMatchObject({
      features: {
        actionServerConfigDeploy: true,
        actionDeployTokenAuth: false,
        sourcePackages: true,
        serverSideConfigBootstrap: true,
      },
    });
  });

  test("[SELF-AUTH-ACTION-003] advertises Action deploy-token auth when a verifier is wired", async () => {
    const app = createTestApp({
      actionDeployTokenAuthorizationPort: {
        authorize: async () =>
          ok({
            actor: {
              kind: "deploy-token",
              id: "dtok_test",
            },
          }),
      },
    });

    const response = await app.handle(new Request("http://localhost/api/version"));

    expect(await response.json()).toMatchObject({
      features: {
        actionDeployTokenAuth: true,
      },
    });
  });
});
