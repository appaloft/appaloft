import { describe, expect, test } from "bun:test";

import {
  resourceAccessSummarySchema,
  resourceDiagnosticSummarySchema,
  resourceHealthSummarySchema,
  routeIntentStatusDescriptorSchema,
} from "../src/index";

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

  test("[RES-ACCESS-DIAG-OBS-004][WEB-CLI-API-ACCESS-001] validates latest access failure envelope across read contracts", () => {
    const latestAccessFailureDiagnostic = {
      schemaVersion: "resource-access-failure/v1",
      requestId: "req_access_timeout",
      generatedAt: "2026-01-01T00:00:08.000Z",
      code: "resource_access_upstream_timeout",
      category: "timeout",
      phase: "upstream-connection",
      httpStatus: 504,
      retriable: true,
      ownerHint: "resource",
      nextAction: "check-health",
      affected: {
        url: "https://web.example.test/",
        hostname: "web.example.test",
        path: "/",
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
        routeSource: "generated-default",
        routeStatus: "ready",
      },
      causeCode: "resource_public_access_probe_failed",
      correlationId: "corr_access_timeout",
    };

    const accessSummary = resourceAccessSummarySchema.parse({
      latestGeneratedAccessRoute: {
        url: "http://web.203.0.113.10.sslip.io",
        hostname: "web.203.0.113.10.sslip.io",
        scheme: "http",
        providerKey: "sslip",
        deploymentId: "dep_web",
        deploymentStatus: "succeeded",
        pathPrefix: "/",
        proxyKind: "traefik",
        targetPort: 3000,
        updatedAt: "2026-01-01T00:00:05.000Z",
      },
      proxyRouteStatus: "ready",
      latestAccessFailureDiagnostic,
    });

    const health = resourceHealthSummarySchema.parse({
      schemaVersion: "resources.health/v1",
      resourceId: "res_web",
      generatedAt: "2026-01-01T00:00:10.000Z",
      overall: "degraded",
      runtime: {
        lifecycle: "running",
        health: "healthy",
      },
      healthPolicy: {
        status: "configured",
        enabled: true,
      },
      publicAccess: {
        status: "failed",
        reasonCode: "resource_access_upstream_timeout",
        phase: "upstream-connection",
        latestAccessFailure: latestAccessFailureDiagnostic,
      },
      proxy: {
        status: "ready",
      },
      checks: [],
      sourceErrors: [
        {
          source: "public-access",
          code: "resource_access_upstream_timeout",
          category: "timeout",
          phase: "upstream-connection",
          retriable: true,
          relatedEntityId: "res_web",
          relatedState: "check-health",
        },
      ],
    });

    const diagnostic = resourceDiagnosticSummarySchema.parse({
      schemaVersion: "resources.diagnostic-summary/v1",
      generatedAt: "2026-01-01T00:00:10.000Z",
      focus: {
        resourceId: "res_web",
      },
      context: {
        projectId: "prj_demo",
        environmentId: "env_demo",
        resourceName: "Web",
        resourceSlug: "web",
        resourceKind: "application",
        services: [],
      },
      access: {
        status: "failed",
        latestAccessFailure: latestAccessFailureDiagnostic,
      },
      proxy: {
        status: "available",
        configurationIncluded: false,
      },
      deploymentLogs: {
        status: "not-requested",
        tailLimit: 0,
        lineCount: 0,
        lines: [],
      },
      runtimeLogs: {
        status: "not-requested",
        tailLimit: 0,
        lineCount: 0,
        lines: [],
      },
      system: {
        entrypoint: "system",
        requestId: "req_system",
        locale: "en-US",
      },
      sourceErrors: [],
      redaction: {
        policy: "deployment-environment-secrets",
        masked: false,
        maskedValueCount: 0,
      },
      copy: {
        json: "{}",
      },
    });

    expect(accessSummary.latestAccessFailureDiagnostic?.requestId).toBe("req_access_timeout");
    expect(health.publicAccess.latestAccessFailure?.nextAction).toBe("check-health");
    expect(diagnostic.access.latestAccessFailure?.route?.domainBindingId).toBe("dbnd_web");
  });
});
