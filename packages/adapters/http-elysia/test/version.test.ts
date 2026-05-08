import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
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
        sourcePackages: true,
        serverSideConfigBootstrap: true,
      },
    });
  });
});
