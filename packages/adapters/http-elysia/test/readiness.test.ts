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
import { createHttpApp } from "../src";

class SilentLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class PublicReadinessQueryBus {
  async execute(_context: unknown, query: { constructor: { name: string } }) {
    if (query.constructor.name === "DoctorQuery") {
      return ok({
        readiness: {
          status: "ready" as const,
          checks: {
            database: true,
            migrations: true,
          },
          details: {
            databaseDriver: "postgres",
            databaseMode: "external",
            databaseLocation: "postgres://appaloft:secret@postgres:5432/appaloft",
          },
        },
        providers: [],
        plugins: [],
      });
    }

    return ok({ items: [] });
  }
}

function createTestApp() {
  return createHttpApp({
    config: resolveConfig({
      flags: {
        appVersion: "0.1.0-test",
        authProvider: "none",
        webStaticDir: "",
      },
    }),
    commandBus: {} as unknown as CommandBus,
    queryBus: new PublicReadinessQueryBus() as unknown as QueryBus,
    logger: new SilentLogger(),
    executionContextFactory: {
      create(contextInput) {
        return createExecutionContext(contextInput);
      },
    },
  });
}

describe("HTTP readiness endpoints", () => {
  test("[CONTROL-PLANE-INSTALL-006] masks private database location from public readiness responses", async () => {
    const app = createTestApp();

    const readinessResponse = await app.handle(new Request("http://localhost/api/readiness"));
    const readiness = await readinessResponse.json();

    expect(readiness).toEqual({
      status: "ready",
      checks: {
        database: true,
        migrations: true,
      },
      details: {
        databaseDriver: "postgres",
        databaseMode: "external",
      },
    });

    const overviewResponse = await app.handle(new Request("http://localhost/api/console-overview"));
    const overviewText = await overviewResponse.text();

    expect(overviewText).not.toContain("databaseLocation");
    expect(overviewText).not.toContain("secret@postgres");
  });
});
