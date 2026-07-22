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
  readonly #listeners = new Set<(entry: CapturedLogEntry) => void>();

  waitForMessage(message: string): Promise<CapturedLogEntry> {
    const captured = this.entries.find((entry) => entry.message === message);
    if (captured) {
      return Promise.resolve(captured);
    }

    return new Promise((resolve) => {
      const listener = (entry: CapturedLogEntry) => {
        if (entry.message !== message) {
          return;
        }
        this.#listeners.delete(listener);
        resolve(entry);
      };
      this.#listeners.add(listener);
    });
  }

  private capture(entry: CapturedLogEntry): void {
    this.entries.push(entry);
    for (const listener of this.#listeners) {
      listener(entry);
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.capture({ level: "debug", message, ...(context ? { context } : {}) });
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.capture({ level: "info", message, ...(context ? { context } : {}) });
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.capture({ level: "warn", message, ...(context ? { context } : {}) });
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.capture({ level: "error", message, ...(context ? { context } : {}) });
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

describe("HTTP request logging", () => {
  test("logs completed backend API requests", async () => {
    const logger = new CapturingLogger();
    const app = createTestApp(logger);

    const completedRequest = logger.waitForMessage("http_request.completed");
    const response = await app.handle(
      new Request("http://localhost/api/health", {
        headers: {
          "x-request-id": "req_http_log_test",
        },
      }),
    );
    const entry = await completedRequest;

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
    expect(typeof entry.context?.durationMs).toBe("number");
  });

  test("does not log static console fallback requests", async () => {
    const logger = new CapturingLogger();
    const app = createTestApp(logger);

    const response = await app.handle(new Request("http://localhost/"));
    await response.text();

    expect(response.status).toBe(200);
    expect(logger.entries).toEqual([]);
  });
});
