import "reflect-metadata";

import { afterAll, describe, expect, test } from "bun:test";
import { type CommandBus, createExecutionContext, type QueryBus } from "@appaloft/application";
import { resolveConfig } from "@appaloft/config";
import { bootstrapOpenTelemetry } from "@appaloft/observability/bootstrap";

import { createHttpApp } from "../src";

const collector = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch() {
    return new Response("");
  },
});
const telemetry = await bootstrapOpenTelemetry({
  appVersion: "0.1.0-test",
  environment: "test",
  otelEnabled: true,
  otelServiceName: "appaloft-http-test",
  otelExporterEndpoint: `http://127.0.0.1:${collector.port}/v1/traces`,
  otelTracesSampler: "always_on",
});

afterAll(async () => {
  await telemetry.shutdown();
  collector.stop(true);
});

describe("Elysia trace headers", () => {
  test("exposes traceparent and Link on a real HTTP response", async () => {
    const config = resolveConfig({
      flags: {
        appVersion: "0.1.0-test",
        authProvider: "none",
        traceLinkBaseUrl: "http://localhost:16686///",
        webStaticDir: "",
      },
    });
    const app = createHttpApp({
      config,
      commandBus: {} as unknown as CommandBus,
      queryBus: {} as unknown as QueryBus,
      logger: {
        debug() {},
        error() {},
        info() {},
        warn() {},
      },
      executionContextFactory: {
        create(input) {
          return createExecutionContext(input);
        },
      },
    });

    app.listen({
      hostname: "127.0.0.1",
      port: 0,
    });

    try {
      const port = app.server?.port;
      if (typeof port !== "number") {
        throw new Error("HTTP test server did not expose a port");
      }

      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      const traceparent = response.headers.get("traceparent");
      const link = response.headers.get("link");

      expect(response.status).toBe(200);
      expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);
      expect(link).toMatch(/^<http:\/\/localhost:16686\/trace\/[0-9a-f]{32}>; rel="trace"$/);
    } finally {
      app.server?.stop(true);
    }
  });
});
