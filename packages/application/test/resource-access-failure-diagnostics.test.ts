import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import {
  classifyResourceAccessFailure,
  parseResourceAccessFailureCode,
  parseResourceAccessFailureSignal,
  resourceAccessFailureCodeFromHttpStatus,
} from "../src";

describe("resource access failure diagnostics", () => {
  test("[RES-ACCESS-DIAG-CLASS-001] classifies route-not-found as an outer not-found diagnostic", () => {
    const diagnostic = classifyResourceAccessFailure({
      signal: "route-not-found",
      requestId: "req_access_route_missing",
      generatedAt: "2026-04-20T00:00:00.000Z",
    });

    expect(diagnostic).toMatchObject({
      schemaVersion: "resource-access-failure/v1",
      requestId: "req_access_route_missing",
      code: "resource_access_route_not_found",
      category: "not-found",
      phase: "edge-request-routing",
      httpStatus: 404,
      retriable: false,
      ownerHint: "platform",
    });
  });

  test("[RES-ACCESS-DIAG-CLASS-006] classifies upstream timeout without using domain category", () => {
    const diagnostic = classifyResourceAccessFailure({
      signal: "upstream-timeout",
      requestId: "req_access_timeout",
      generatedAt: "2026-04-20T00:00:00.000Z",
      route: {
        resourceId: "res_web",
        deploymentId: "dep_web",
        providerKey: "traefik",
      },
    });

    expect(diagnostic).toMatchObject({
      code: "resource_access_upstream_timeout",
      category: "timeout",
      phase: "upstream-connection",
      httpStatus: 504,
      retriable: true,
      ownerHint: "resource",
      route: {
        resourceId: "res_web",
        deploymentId: "dep_web",
        providerKey: "traefik",
      },
    });
    expect(diagnostic.category).not.toBe("domain");
  });

  test("[RES-ACCESS-DIAG-CLASS-010][RES-ACCESS-DIAG-OBS-003] builds a copy-safe envelope with affected request, related ids, next action, and cause code", () => {
    const diagnostic = classifyResourceAccessFailure({
      signal: "upstream-timeout",
      requestId: "req access timeout",
      generatedAt: "2026-04-20T00:00:00.000Z",
      affected: {
        url: "https://web.example.test/private?token=secret-token#fragment",
        hostname: "web.example.test",
        path: "/private?token=secret-token",
        method: "get",
      },
      route: {
        resourceId: "res_web",
        deploymentId: "dep_web",
        domainBindingId: "dbnd_web",
        serverId: "srv_web",
        destinationId: "dst_web",
        providerKey: "traefik",
        routeId: "route_web",
        routeSource: "durable-domain",
        routeStatus: "failed",
      },
      causeCode: "resource_public_access_probe_failed",
      correlationId: "corr_access_timeout",
      causationId: "cause_access_timeout",
    });

    expect(diagnostic).toMatchObject({
      schemaVersion: "resource-access-failure/v1",
      requestId: "req_access_timeout",
      code: "resource_access_upstream_timeout",
      category: "timeout",
      phase: "upstream-connection",
      httpStatus: 504,
      retriable: true,
      ownerHint: "resource",
      nextAction: "check-health",
      affected: {
        url: "https://web.example.test/private",
        hostname: "web.example.test",
        path: "/private",
        method: "GET",
      },
      route: {
        resourceId: "res_web",
        deploymentId: "dep_web",
        domainBindingId: "dbnd_web",
        serverId: "srv_web",
        destinationId: "dst_web",
        providerKey: "traefik",
        routeId: "route_web",
        routeSource: "durable-domain",
        routeStatus: "failed",
      },
      causeCode: "resource_public_access_probe_failed",
      correlationId: "corr_access_timeout",
      causationId: "cause_access_timeout",
    });
    expect(JSON.stringify(diagnostic)).not.toContain("secret-token");
    expect(JSON.stringify(diagnostic)).not.toContain("Authorization");
  });

  test("parses known codes, signals, and gateway status fallbacks", () => {
    expect(parseResourceAccessFailureCode("resource_access_upstream_reset")).toBe(
      "resource_access_upstream_reset",
    );
    expect(parseResourceAccessFailureCode("traefik_bad_gateway")).toBeNull();
    expect(parseResourceAccessFailureSignal("upstream-connect-failed")).toBe(
      "upstream-connect-failed",
    );
    expect(parseResourceAccessFailureSignal("connection refused")).toBeNull();
    expect(resourceAccessFailureCodeFromHttpStatus(502)).toBe(
      "resource_access_upstream_connect_failed",
    );
    expect(resourceAccessFailureCodeFromHttpStatus(504)).toBe("resource_access_upstream_timeout");
    expect(resourceAccessFailureCodeFromHttpStatus(418)).toBe("resource_access_unknown");
  });
});
