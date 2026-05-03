import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  type Query,
  type QueryBus,
  ResourceDiagnosticSummaryQuery,
  ResourceHealthQuery,
  ResourceProxyConfigurationPreviewQuery,
  ShowDomainBindingQuery,
  ShowResourceQuery,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";
import { Elysia } from "elysia";

import { mountAppaloftOrpcRoutes } from "../src";

class NoopLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class TestExecutionContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      requestId: input.requestId ?? "req_orpc_access_regression_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

const generatedRoute = {
  url: "https://generated.example.test",
  hostname: "generated.example.test",
  scheme: "https" as const,
  providerKey: "sslip",
  deploymentId: "dep_generated",
  deploymentStatus: "succeeded" as const,
  pathPrefix: "/",
  proxyKind: "traefik" as const,
  targetPort: 3000,
  updatedAt: "2026-01-01T00:00:05.000Z",
};

const serverAppliedRoute = {
  url: "https://server-applied.example.test",
  hostname: "server-applied.example.test",
  scheme: "https" as const,
  deploymentId: "dep_server_applied",
  deploymentStatus: "succeeded" as const,
  pathPrefix: "/",
  proxyKind: "traefik" as const,
  targetPort: 3000,
  updatedAt: "2026-01-01T00:00:06.000Z",
};

const durableRoute = {
  url: "https://durable.example.test",
  hostname: "durable.example.test",
  scheme: "https" as const,
  providerKey: "traefik",
  deploymentId: "dep_durable",
  deploymentStatus: "succeeded" as const,
  pathPrefix: "/",
  proxyKind: "traefik" as const,
  targetPort: 3000,
  updatedAt: "2026-01-01T00:00:07.000Z",
};

const routeIntentStatus = {
  schemaVersion: "route-intent-status/v1" as const,
  routeId: "durable_domain_binding:durable.example.test:/:dep_durable",
  diagnosticId: "durable_domain_binding:durable.example.test:/:dep_durable",
  source: "durable-domain-binding" as const,
  intent: {
    host: "durable.example.test",
    pathPrefix: "/",
    protocol: "https" as const,
    routeBehavior: "serve" as const,
  },
  context: {
    resourceId: "res_web",
    deploymentId: "dep_durable",
    serverId: "srv_demo",
    destinationId: "dst_demo",
  },
  proxy: {
    intent: "required" as const,
    applied: "ready" as const,
    providerKey: "traefik",
  },
  domainVerification: "verified" as const,
  tls: "active" as const,
  runtimeHealth: "unknown" as const,
  latestObservation: {
    source: "resource-access-summary" as const,
    observedAt: "2026-01-01T00:00:07.000Z",
    deploymentId: "dep_durable",
  },
  recommendedAction: "none" as const,
  copySafeSummary: {
    status: "available" as const,
    message: "Route access is available according to the latest route observation.",
  },
};

const latestAccessFailure = {
  schemaVersion: "resource-access-failure/v1" as const,
  requestId: "req_access_timeout",
  generatedAt: "2026-01-01T00:00:08.000Z",
  code: "resource_access_upstream_timeout" as const,
  category: "timeout" as const,
  phase: "upstream-connection" as const,
  httpStatus: 504 as const,
  retriable: true,
  ownerHint: "resource" as const,
  nextAction: "check-health" as const,
  affected: {
    url: "https://durable.example.test/private",
    hostname: "durable.example.test",
    path: "/private",
    method: "GET",
  },
  route: {
    resourceId: "res_web",
    deploymentId: "dep_durable",
    domainBindingId: "dmb_ready",
    serverId: "srv_demo",
    destinationId: "dst_demo",
    providerKey: "traefik",
    routeId: "route_durable",
    routeSource: "durable-domain" as const,
    routeStatus: "ready",
  },
  causeCode: "resource_public_access_probe_failed",
};

const accessSummary = {
  plannedGeneratedAccessRoute: {
    url: "https://planned.example.test",
    hostname: "planned.example.test",
    scheme: "https" as const,
    providerKey: "sslip",
    pathPrefix: "/",
    proxyKind: "traefik" as const,
    targetPort: 3000,
  },
  latestGeneratedAccessRoute: generatedRoute,
  latestServerAppliedDomainRoute: serverAppliedRoute,
  latestDurableDomainRoute: durableRoute,
  proxyRouteStatus: "ready" as const,
  lastRouteRealizationDeploymentId: "dep_durable",
  latestAccessFailureDiagnostic: latestAccessFailure,
};

function routeDiagnosticCopy() {
  return JSON.stringify(
    {
      access: {
        generatedUrl: generatedRoute.url,
        durableUrl: durableRoute.url,
        serverAppliedUrl: serverAppliedRoute.url,
        selectedRoute: routeIntentStatus,
        latestAccessFailure,
      },
    },
    null,
    2,
  );
}

function createApp() {
  const capturedQueries: Query<unknown>[] = [];
  const commandBus = {
    execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
      ok(null as T),
  } as CommandBus;
  const queryBus = {
    execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
      capturedQueries.push(query as Query<unknown>);

      if (query instanceof ShowResourceQuery) {
        return ok({
          schemaVersion: "resources.show/v1",
          resource: {
            id: "res_web",
            projectId: "prj_demo",
            environmentId: "env_demo",
            destinationId: "dst_demo",
            name: "Web",
            slug: "web",
            kind: "application",
            createdAt: "2026-01-01T00:00:00.000Z",
            services: [],
            deploymentCount: 3,
            lastDeploymentId: "dep_durable",
            lastDeploymentStatus: "succeeded",
          },
          networkProfile: {
            internalPort: 3000,
            upstreamProtocol: "http",
            exposureMode: "reverse-proxy",
          },
          accessSummary,
          lifecycle: {
            status: "active",
          },
          diagnostics: [],
          generatedAt: "2026-01-01T00:00:10.000Z",
        } as T);
      }

      if (query instanceof ResourceHealthQuery) {
        return ok({
          schemaVersion: "resources.health/v1",
          resourceId: "res_web",
          generatedAt: "2026-01-01T00:00:10.000Z",
          overall: "degraded",
          latestDeployment: {
            id: "dep_durable",
            status: "succeeded",
            createdAt: "2026-01-01T00:00:07.000Z",
            serverId: "srv_demo",
            destinationId: "dst_demo",
          },
          runtime: {
            lifecycle: "running",
            health: "unknown",
            observedAt: "2026-01-01T00:00:10.000Z",
            runtimeKind: "docker-container",
          },
          healthPolicy: {
            status: "not-configured",
            enabled: false,
          },
          publicAccess: {
            status: "failed",
            url: durableRoute.url,
            kind: "durable-domain",
            reasonCode: latestAccessFailure.code,
            phase: latestAccessFailure.phase,
            routeIntentStatus,
            latestAccessFailure,
          },
          proxy: {
            status: "ready",
            providerKey: "traefik",
            lastRouteRealizationDeploymentId: "dep_durable",
          },
          checks: [],
          sourceErrors: [
            {
              source: "public-access",
              code: latestAccessFailure.code,
              category: latestAccessFailure.category,
              phase: latestAccessFailure.phase,
              retriable: true,
              relatedEntityId: "res_web",
              relatedState: "check-health",
            },
          ],
        } as T);
      }

      if (query instanceof ResourceProxyConfigurationPreviewQuery) {
        return ok({
          resourceId: "res_web",
          deploymentId: "dep_durable",
          providerKey: "traefik",
          routeScope: "latest",
          status: "applied",
          generatedAt: "2026-01-01T00:00:10.000Z",
          lastAppliedDeploymentId: "dep_durable",
          stale: false,
          routes: [
            {
              hostname: durableRoute.hostname,
              scheme: durableRoute.scheme,
              url: durableRoute.url,
              pathPrefix: durableRoute.pathPrefix,
              tlsMode: "auto",
              targetPort: 3000,
              source: "domain-binding",
            },
            {
              hostname: serverAppliedRoute.hostname,
              scheme: serverAppliedRoute.scheme,
              url: serverAppliedRoute.url,
              pathPrefix: serverAppliedRoute.pathPrefix,
              tlsMode: "auto",
              targetPort: 3000,
              source: "server-applied",
            },
            {
              hostname: generatedRoute.hostname,
              scheme: generatedRoute.scheme,
              url: generatedRoute.url,
              pathPrefix: generatedRoute.pathPrefix,
              tlsMode: "auto",
              targetPort: 3000,
              source: "generated-default",
            },
          ],
          sections: [
            {
              id: "labels",
              title: "Labels",
              format: "docker-labels",
              readonly: true,
              redacted: false,
              content: "traefik.enable=true",
              source: "provider-rendered",
            },
          ],
          warnings: [],
        } as T);
      }

      if (query instanceof ResourceDiagnosticSummaryQuery) {
        return ok({
          schemaVersion: "resources.diagnostic-summary/v1",
          generatedAt: "2026-01-01T00:00:10.000Z",
          focus: {
            resourceId: "res_web",
            deploymentId: "dep_durable",
          },
          context: {
            projectId: "prj_demo",
            environmentId: "env_demo",
            resourceName: "Web",
            resourceSlug: "web",
            resourceKind: "application",
            destinationId: "dst_demo",
            serverId: "srv_demo",
            services: [],
          },
          access: {
            status: "failed",
            generatedUrl: generatedRoute.url,
            durableUrl: durableRoute.url,
            serverAppliedUrl: serverAppliedRoute.url,
            plannedUrl: "https://planned.example.test",
            latestAccessFailure,
            selectedRoute: routeIntentStatus,
            routeIntentStatuses: [
              routeIntentStatus,
              {
                ...routeIntentStatus,
                routeId: "server_applied_route:server-applied.example.test:/:dep_server_applied",
                diagnosticId:
                  "server_applied_route:server-applied.example.test:/:dep_server_applied",
                source: "server-applied-route",
                intent: {
                  ...routeIntentStatus.intent,
                  host: serverAppliedRoute.hostname,
                },
              },
              {
                ...routeIntentStatus,
                routeId: "generated_default_access:generated.example.test:/:dep_generated",
                diagnosticId: "generated_default_access:generated.example.test:/:dep_generated",
                source: "generated-default-access",
                intent: {
                  ...routeIntentStatus.intent,
                  host: generatedRoute.hostname,
                },
              },
            ],
            proxyRouteStatus: "ready",
            lastRouteRealizationDeploymentId: "dep_durable",
            reasonCode: latestAccessFailure.code,
            phase: latestAccessFailure.phase,
          },
          proxy: {
            status: "available",
            providerKey: "traefik",
            proxyRouteStatus: "ready",
            configurationIncluded: true,
            configurationStatus: "applied",
            configurationGeneratedAt: "2026-01-01T00:00:10.000Z",
            routeCount: 3,
            sectionCount: 1,
          },
          deploymentLogs: {
            status: "not-requested",
            tailLimit: 10,
            lineCount: 0,
            lines: [],
          },
          runtimeLogs: {
            status: "not-requested",
            tailLimit: 10,
            lineCount: 0,
            lines: [],
          },
          system: {
            entrypoint: "http",
            requestId: "req_orpc_access_regression_test",
            locale: "en-US",
          },
          sourceErrors: [
            {
              source: "access",
              code: latestAccessFailure.code,
              category: latestAccessFailure.category,
              phase: latestAccessFailure.phase,
              retryable: true,
              relatedEntityId: "res_web",
              relatedState: "check-health",
            },
          ],
          redaction: {
            policy: "deployment-environment-secrets",
            masked: false,
            maskedValueCount: 0,
          },
          copy: {
            json: routeDiagnosticCopy(),
          },
        } as T);
      }

      if (query instanceof ShowDomainBindingQuery) {
        return ok({
          binding: {
            id: "dmb_ready",
            projectId: "prj_demo",
            environmentId: "env_demo",
            resourceId: "res_web",
            serverId: "srv_demo",
            destinationId: "dst_demo",
            domainName: "durable.example.test",
            pathPrefix: "/",
            proxyKind: "traefik",
            tlsMode: "auto",
            certificatePolicy: "auto",
            status: "ready",
            verificationAttemptCount: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          routeReadiness: {
            status: "ready",
            routeBehavior: "serve",
            selectedRoute: routeIntentStatus,
            contextRoutes: [
              routeIntentStatus,
              {
                ...routeIntentStatus,
                routeId: "server_applied_route:server-applied.example.test:/:dep_server_applied",
                diagnosticId:
                  "server_applied_route:server-applied.example.test:/:dep_server_applied",
                source: "server-applied-route",
                intent: {
                  ...routeIntentStatus.intent,
                  host: serverAppliedRoute.hostname,
                },
              },
            ],
          },
          generatedAccessFallback: generatedRoute,
          proxyReadiness: "ready",
          certificates: [],
          deleteSafety: {
            domainBindingId: "dmb_ready",
            safeToDelete: true,
            blockers: [],
            warnings: [],
            preservesGeneratedAccess: true,
            preservesDeploymentSnapshots: true,
            preservesServerAppliedRouteAudit: true,
          },
        } as T);
      }

      return ok(null as T);
    },
  } as QueryBus;

  return {
    capturedQueries,
    app: mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    }),
  };
}

describe("access/proxy/health/diagnostic HTTP regression harness", () => {
  test("[WEB-CLI-API-ACCESS-004] API/oRPC resources and domain binding reads preserve shared access context", async () => {
    const { app, capturedQueries } = createApp();

    const showResponse = await app.handle(
      new Request("http://localhost/api/resources/res_web?includeAccessSummary=true"),
    );
    const healthResponse = await app.handle(
      new Request("http://localhost/api/resources/res_web/health"),
    );
    const proxyResponse = await app.handle(
      new Request("http://localhost/api/resources/res_web/proxy-configuration"),
    );
    const diagnosticResponse = await app.handle(
      new Request(
        "http://localhost/api/resources/res_web/diagnostic-summary?includeProxyConfiguration=true",
      ),
    );
    const domainBindingResponse = await app.handle(
      new Request("http://localhost/api/domain-bindings/dmb_ready"),
    );

    expect(showResponse.status).toBe(200);
    expect(healthResponse.status).toBe(200);
    expect(proxyResponse.status).toBe(200);
    expect(diagnosticResponse.status).toBe(200);
    expect(domainBindingResponse.status).toBe(200);

    expect(await showResponse.json()).toMatchObject({
      accessSummary: {
        latestGeneratedAccessRoute: { url: generatedRoute.url },
        latestServerAppliedDomainRoute: { url: serverAppliedRoute.url },
        latestDurableDomainRoute: { url: durableRoute.url },
        latestAccessFailureDiagnostic: { requestId: "req_access_timeout" },
      },
    });
    expect(await healthResponse.json()).toMatchObject({
      publicAccess: {
        url: durableRoute.url,
        kind: "durable-domain",
        routeIntentStatus: { source: "durable-domain-binding" },
        latestAccessFailure: { code: "resource_access_upstream_timeout" },
      },
    });
    expect(await proxyResponse.json()).toMatchObject({
      routes: [
        { hostname: durableRoute.hostname, source: "domain-binding" },
        { hostname: serverAppliedRoute.hostname, source: "server-applied" },
        { hostname: generatedRoute.hostname, source: "generated-default" },
      ],
    });
    expect(await diagnosticResponse.json()).toMatchObject({
      access: {
        generatedUrl: generatedRoute.url,
        durableUrl: durableRoute.url,
        serverAppliedUrl: serverAppliedRoute.url,
        selectedRoute: { source: "durable-domain-binding" },
        latestAccessFailure: { requestId: "req_access_timeout" },
      },
      proxy: {
        configurationStatus: "applied",
      },
    });
    expect(await domainBindingResponse.json()).toMatchObject({
      routeReadiness: {
        status: "ready",
        selectedRoute: { source: "durable-domain-binding" },
        contextRoutes: [{ source: "durable-domain-binding" }, { source: "server-applied-route" }],
      },
      generatedAccessFallback: { url: generatedRoute.url },
      proxyReadiness: "ready",
    });
    expect(capturedQueries.some((query) => query instanceof ShowResourceQuery)).toBe(true);
    expect(capturedQueries.some((query) => query instanceof ResourceHealthQuery)).toBe(true);
    expect(
      capturedQueries.some((query) => query instanceof ResourceProxyConfigurationPreviewQuery),
    ).toBe(true);
    expect(capturedQueries.some((query) => query instanceof ResourceDiagnosticSummaryQuery)).toBe(
      true,
    );
    expect(capturedQueries.some((query) => query instanceof ShowDomainBindingQuery)).toBe(true);
  });
});
