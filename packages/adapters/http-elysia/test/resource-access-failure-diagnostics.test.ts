import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type CommandBus,
  createExecutionContext,
  type QueryBus,
  type RepositoryContext,
  type ResourceAccessFailureDiagnostic,
  type ResourceAccessFailureEvidenceRecord,
  type ResourceAccessFailureEvidenceRecorder,
} from "@appaloft/application";
import { resolveConfig } from "@appaloft/config";
import { ok, type Result } from "@appaloft/core";
import { createHttpApp } from "../src";

class SilentLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class RecordingEvidenceRecorder implements ResourceAccessFailureEvidenceRecorder {
  records: ResourceAccessFailureEvidenceRecord[] = [];

  async record(
    _context: RepositoryContext,
    input: {
      diagnostic: ResourceAccessFailureDiagnostic;
      capturedAt: string;
      expiresAt: string;
    },
  ): Promise<Result<ResourceAccessFailureEvidenceRecord>> {
    const record = {
      requestId: input.diagnostic.requestId,
      diagnostic: input.diagnostic,
      capturedAt: input.capturedAt,
      expiresAt: input.expiresAt,
    };
    this.records.push(record);
    return ok(record);
  }
}

function createTestApp(input?: { evidenceRecorder?: ResourceAccessFailureEvidenceRecorder }) {
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
    resourceAccessFailureEvidenceRecorder: input?.evidenceRecorder,
  });
}

describe("resource access failure diagnostics HTTP renderer", () => {
  test("[RES-ACCESS-DIAG-CLASS-001] maps provider-injected route-not-found signals to the stable diagnostic code", async () => {
    const app = createTestApp();
    const response = await app.handle(
      new Request(
        "http://localhost/.appaloft/resource-access-failure?requestId=req_route_missing",
        {
          headers: {
            accept: "application/json",
            "x-appaloft-resource-access-signal": "route-not-found",
          },
        },
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      code: "resource_access_route_not_found",
      category: "not-found",
      phase: "edge-request-routing",
      requestId: "req_route_missing",
      retriable: false,
      ownerHint: "platform",
    });
  });

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

  test("[RES-ACCESS-DIAG-EVIDENCE-004] captures sanitized evidence without leaking unsafe request data", async () => {
    const evidenceRecorder = new RecordingEvidenceRecorder();
    const app = createTestApp({ evidenceRecorder });
    const response = await app.handle(
      new Request(
        "http://localhost/.appaloft/resource-access-failure?signal=route-not-found&requestId=req route missing&affectedUrl=https%3A%2F%2Fweb.example.test%2Fprivate%3Ftoken%3Dsecret&host=web.example.test&path=/private?token=secret&resourceId=res_web&deploymentId=dep_web&providerKey=traefik",
        {
          headers: {
            accept: "application/json",
            authorization: "Bearer secret-token",
            cookie: "session=secret",
          },
        },
      ),
    );

    expect(response.status).toBe(404);
    expect(evidenceRecorder.records).toHaveLength(1);
    expect(evidenceRecorder.records[0]).toMatchObject({
      requestId: "req_route_missing",
      diagnostic: {
        affected: {
          url: "https://web.example.test/private",
          path: "/private",
        },
        route: {
          resourceId: "res_web",
          deploymentId: "dep_web",
          providerKey: "traefik",
        },
      },
    });
    const serialized = JSON.stringify(evidenceRecorder.records[0]);
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("session=secret");
    expect(serialized).not.toContain("token=secret");
  });
});
