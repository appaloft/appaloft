import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type CommandBus,
  createExecutionContext,
  type QueryBus,
} from "@appaloft/application";
import { resolveConfig } from "@appaloft/config";
import { createHttpApp } from "../src";

interface CapturedLogEntry {
  context?: Record<string, unknown>;
  level: "debug" | "info" | "warn" | "error";
  message: string;
}

class CapturingLogger implements AppLogger {
  readonly entries: CapturedLogEntry[] = [];

  debug(message: string, context?: Record<string, unknown>): void {
    this.entries.push({ level: "debug", message, ...(context ? { context } : {}) });
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.entries.push({ level: "info", message, ...(context ? { context } : {}) });
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.entries.push({ level: "warn", message, ...(context ? { context } : {}) });
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.entries.push({ level: "error", message, ...(context ? { context } : {}) });
  }
}

function createTestApp(logger: AppLogger) {
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
    logger,
    executionContextFactory: {
      create(input) {
        return createExecutionContext(input);
      },
    },
  });
}

async function withServer<T>(
  app: ReturnType<typeof createHttpApp>,
  callback: (baseUrl: string) => Promise<T>,
): Promise<T> {
  app.listen({
    hostname: "127.0.0.1",
    port: 0,
  });

  const port = app.server?.port;
  if (typeof port !== "number") {
    throw new Error("HTTP test server did not expose a port");
  }

  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    app.server?.stop(true);
  }
}

describe("HTTP request logging", () => {
  test("logs completed backend API requests", async () => {
    const logger = new CapturingLogger();
    const app = createTestApp(logger);

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/health`, {
        headers: {
          "x-request-id": "req_http_log_test",
        },
      });

      const entry = logger.entries.find((item) => item.message === "http_request.completed");

      expect(response.status).toBe(200);
      expect(entry).toMatchObject({
        level: "info",
        context: {
          method: "GET",
          path: "/api/health",
          statusCode: 200,
          requestId: "req_http_log_test",
        },
      });
      expect(typeof entry?.context?.durationMs).toBe("number");
    });
  });

  test("does not log static console fallback requests", async () => {
    const logger = new CapturingLogger();
    const app = createTestApp(logger);

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/`);

      expect(response.status).toBe(200);
      expect(logger.entries).toEqual([]);
    });
  });
});
