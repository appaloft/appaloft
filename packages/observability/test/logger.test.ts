import { describe, expect, test } from "bun:test";
import { resolveConfig } from "@appaloft/config";
import { type DestinationStream } from "pino";
import { createLogger, createPinoLogger } from "../src";

function createCaptureStream(): { lines: string[]; stream: DestinationStream } {
  const lines: string[] = [];

  return {
    lines,
    stream: {
      write(line: string) {
        lines.push(line);
      },
    },
  };
}

function parseLogLine(line: string | undefined): Record<string, unknown> {
  if (!line) {
    throw new Error("Expected a log line");
  }

  return JSON.parse(line) as Record<string, unknown>;
}

describe("pino app logger", () => {
  test("writes AppLogger entries through shared pino configuration", () => {
    const config = resolveConfig({
      flags: {
        appName: "Appaloft Test",
        appVersion: "1.2.3-test",
        environment: "test",
        logLevel: "debug",
        otelServiceName: "appaloft-test",
        secretMask: "[hidden]",
      },
    });
    const capture = createCaptureStream();
    const logger = createLogger(config, capture.stream);

    logger.debug("deployment.started", {
      providerKey: "aliyun",
      token: "token-value",
      nested: {
        password: "password-value",
        visible: "kept",
      },
    });

    const record = parseLogLine(capture.lines[0]);

    expect(capture.lines).toHaveLength(1);
    expect(record).toMatchObject({
      level: "debug",
      app: "Appaloft Test",
      version: "1.2.3-test",
      environment: "test",
      service: "appaloft-test",
      message: "deployment.started",
      context: {
        providerKey: "[hidden]",
        token: "[hidden]",
        nested: {
          password: "[hidden]",
          visible: "kept",
        },
      },
    });
    expect(typeof record.timestamp).toBe("string");
  });

  test("uses pino level filtering from AppConfig", () => {
    const config = resolveConfig({
      flags: {
        logLevel: "warn",
      },
    });
    const capture = createCaptureStream();
    const logger = createLogger(config, capture.stream);

    logger.info("ignored");
    logger.warn("kept");

    const record = parseLogLine(capture.lines[0]);

    expect(capture.lines).toHaveLength(1);
    expect(record).toMatchObject({
      level: "warn",
      message: "kept",
    });
  });

  test("applies the same masking and shape to direct pino users", () => {
    const config = resolveConfig({
      flags: {
        logLevel: "info",
        secretMask: "[masked]",
      },
    });
    const capture = createCaptureStream();
    const logger = createPinoLogger(config, capture.stream);

    logger.info(
      {
        githubClientSecret: "client-secret",
        context: {
          values: [{ apiToken: "api-token", name: "demo" }],
        },
      },
      "direct.pino",
    );

    const record = parseLogLine(capture.lines[0]);

    expect(record).toMatchObject({
      message: "direct.pino",
      githubClientSecret: "[masked]",
      context: {
        values: [{ apiToken: "[masked]", name: "demo" }],
      },
    });
  });
});
