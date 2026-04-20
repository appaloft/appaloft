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

class SilentLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
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
    queryBus: {} as unknown as QueryBus,
    logger: new SilentLogger(),
    executionContextFactory: {
      create(input) {
        return createExecutionContext(input);
      },
    },
  });
}

describe("resource access failure diagnostics HTTP renderer", () => {
  test("[RES-ACCESS-DIAG-RENDER-001] renders an HTML diagnostic page for browser requests", async () => {
    const app = createTestApp();
    const response = await app.handle(
      new Request(
        "http://localhost/.appaloft/resource-access-failure?code=resource_access_upstream_timeout&requestId=req_access_timeout",
        {
          headers: {
            accept: "text/html",
          },
        },
      ),
    );
    const text = await response.text();

    expect(response.status).toBe(504);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("x-appaloft-diagnostic-code")).toBe(
      "resource_access_upstream_timeout",
    );
    expect(text).toContain("Application unavailable");
    expect(text).toContain("resource_access_upstream_timeout");
    expect(text).toContain("req_access_timeout");
    expect(text).not.toContain("Authorization");
    expect(text).not.toContain("docker logs");
  });

  test("[RES-ACCESS-DIAG-RENDER-002] renders problem JSON for API requests", async () => {
    const app = createTestApp();
    const response = await app.handle(
      new Request(
        "http://localhost/.appaloft/resource-access-failure?signal=upstream-connect-failed&requestId=req_access_json",
        {
          headers: {
            accept: "application/json",
          },
        },
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(body).toMatchObject({
      type: "https://appaloft.dev/problems/resource-access-failure",
      code: "resource_access_upstream_connect_failed",
      category: "infra",
      phase: "upstream-connection",
      requestId: "req_access_json",
      retriable: true,
      ownerHint: "resource",
    });
  });

  test("[RES-ACCESS-DIAG-RENDER-004] falls back to unknown for unsafe provider input", async () => {
    const app = createTestApp();
    const response = await app.handle(
      new Request(
        "http://localhost/.appaloft/resource-access-failure?code=traefik_bad_gateway&requestId=req bad gateway",
        {
          headers: {
            accept: "application/json",
          },
        },
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      code: "resource_access_unknown",
      phase: "diagnostic-page-render",
      requestId: "req_bad_gateway",
    });
  });
});
