import { describe, expect, test } from "bun:test";

import { routeIntentStatusDescriptorSchema } from "../src/index";

describe("route intent/status contract", () => {
  test("[ROUTE-INTENT-001][ACCESS-DIAG-001][WEB-CLI-API-ACCESS-001] validates provider-neutral route diagnostic descriptors", () => {
    const descriptor = routeIntentStatusDescriptorSchema.parse({
      schemaVersion: "route-intent-status/v1",
      routeId: "durable_domain_binding:app.example.test:/:dep_web",
      diagnosticId: "durable_domain_binding:app.example.test:/:dep_web",
      source: "durable-domain-binding",
      intent: {
        host: "app.example.test",
        pathPrefix: "/",
        protocol: "https",
        routeBehavior: "serve",
      },
      context: {
        resourceId: "res_web",
        deploymentId: "dep_web",
        serverId: "srv_web",
        destinationId: "dst_web",
        runtimeTargetKind: "single-server",
      },
      proxy: {
        intent: "required",
        applied: "not-ready",
        providerKey: "traefik",
      },
      domainVerification: "pending",
      tls: "pending",
      runtimeHealth: "unknown",
      latestObservation: {
        source: "resource-access-summary",
        observedAt: "2026-01-01T00:00:00.000Z",
        deploymentId: "dep_web",
      },
      blockingReason: "domain_not_verified",
      recommendedAction: "verify-domain",
      copySafeSummary: {
        status: "not-ready",
        code: "domain_not_verified",
        phase: "route-status-observation",
        message: "Durable domain route is selected but not ready.",
      },
    });

    expect(descriptor.source).toBe("durable-domain-binding");
    expect(descriptor.blockingReason).toBe("domain_not_verified");
    expect(JSON.stringify(descriptor)).not.toContain("privateKey");
  });

  test("[ROUTE-STATUS-003][ACCESS-DIAG-003] validates certificate access states as diagnostics", () => {
    const descriptor = routeIntentStatusDescriptorSchema.parse({
      schemaVersion: "route-intent-status/v1",
      routeId: "durable_domain_binding:secure.example.test:/:cert",
      diagnosticId: "durable_domain_binding:secure.example.test:/:cert",
      source: "durable-domain-binding",
      intent: {
        host: "secure.example.test",
        pathPrefix: "/",
        protocol: "https",
        routeBehavior: "serve",
      },
      context: {
        resourceId: "res_secure",
      },
      proxy: {
        intent: "required",
        applied: "ready",
      },
      domainVerification: "verified",
      tls: "expired",
      runtimeHealth: "healthy",
      blockingReason: "certificate_expired_or_not_active",
      recommendedAction: "provide-certificate",
      copySafeSummary: {
        status: "failed",
        code: "certificate_expired_or_not_active",
        phase: "route-status-observation",
        message: "Certificate is expired or not active.",
      },
    });

    expect(descriptor.tls).toBe("expired");
    expect(descriptor.recommendedAction).toBe("provide-certificate");
  });
});
