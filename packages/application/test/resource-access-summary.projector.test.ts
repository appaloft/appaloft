import { describe, expect, test } from "bun:test";
import { projectResourceAccessSummary } from "../src/operations/resources/resource-access-summary.projector";
import {
  routeIntentStatusDescriptors,
  selectedRouteIntentStatus,
} from "../src/operations/resources/route-intent-status";

describe("projectResourceAccessSummary", () => {
  test("projects the latest generated access route separately from deployment history", () => {
    const summary = projectResourceAccessSummary([
      {
        id: "dep_old",
        status: "failed",
        createdAt: "2026-01-01T00:00:00.000Z",
        runtimePlan: {
          execution: {
            accessRoutes: [
              {
                proxyKind: "traefik",
                domains: ["old.example.test"],
                pathPrefix: "/",
                tlsMode: "disabled",
                targetPort: 3000,
              },
            ],
            metadata: {
              "access.routeSource": "generated-default",
              "access.hostname": "old.example.test",
              "access.providerKey": "test-provider",
              "access.scheme": "http",
            },
          },
        },
      },
      {
        id: "dep_new",
        status: "succeeded",
        createdAt: "2026-01-01T01:00:00.000Z",
        runtimePlan: {
          execution: {
            accessRoutes: [
              {
                proxyKind: "traefik",
                domains: ["new.example.test"],
                pathPrefix: "/",
                tlsMode: "disabled",
                targetPort: 3000,
              },
            ],
            metadata: {
              "access.routeSource": "generated-default",
              "access.hostname": "new.example.test",
              "access.providerKey": "test-provider",
              "access.scheme": "http",
            },
          },
        },
      },
    ]);

    expect(summary).toEqual({
      latestGeneratedAccessRoute: {
        url: "http://new.example.test",
        hostname: "new.example.test",
        scheme: "http",
        providerKey: "test-provider",
        deploymentId: "dep_new",
        deploymentStatus: "succeeded",
        pathPrefix: "/",
        proxyKind: "traefik",
        targetPort: 3000,
        updatedAt: "2026-01-01T01:00:00.000Z",
      },
      proxyRouteStatus: "ready",
      lastRouteRealizationDeploymentId: "dep_new",
    });
  });

  test("[ROUTE-TLS-READMODEL-002] projects ready durable domain route without replacing generated access", () => {
    const summary = projectResourceAccessSummary(
      [
        {
          id: "dep_new",
          status: "succeeded",
          createdAt: "2026-01-01T01:00:00.000Z",
          runtimePlan: {
            execution: {
              accessRoutes: [
                {
                  proxyKind: "traefik",
                  domains: ["generated.example.test"],
                  pathPrefix: "/",
                  tlsMode: "disabled",
                  targetPort: 3000,
                },
              ],
              metadata: {
                "access.routeSource": "generated-default",
                "access.hostname": "generated.example.test",
                "access.providerKey": "test-provider",
                "access.scheme": "http",
              },
            },
          },
        },
      ],
      [
        {
          id: "dmb_ready",
          status: "ready",
          createdAt: "2026-01-01T01:05:00.000Z",
          domainName: "app.example.com",
          pathPrefix: "/",
          proxyKind: "traefik",
          tlsMode: "disabled",
        },
      ],
    );

    expect(summary).toEqual({
      latestGeneratedAccessRoute: {
        url: "http://generated.example.test",
        hostname: "generated.example.test",
        scheme: "http",
        providerKey: "test-provider",
        deploymentId: "dep_new",
        deploymentStatus: "succeeded",
        pathPrefix: "/",
        proxyKind: "traefik",
        targetPort: 3000,
        updatedAt: "2026-01-01T01:00:00.000Z",
      },
      latestDurableDomainRoute: {
        url: "http://app.example.com",
        hostname: "app.example.com",
        scheme: "http",
        providerKey: "test-provider",
        deploymentId: "dep_new",
        deploymentStatus: "succeeded",
        pathPrefix: "/",
        proxyKind: "traefik",
        targetPort: 3000,
        updatedAt: "2026-01-01T01:05:00.000Z",
      },
      proxyRouteStatus: "ready",
      lastRouteRealizationDeploymentId: "dep_new",
    });
  });

  test("[ROUTE-TLS-READMODEL-003] does not project a bound TLS-auto binding as durable ready route", () => {
    const summary = projectResourceAccessSummary(
      [
        {
          id: "dep_new",
          status: "succeeded",
          createdAt: "2026-01-01T01:00:00.000Z",
          runtimePlan: {
            execution: {
              accessRoutes: [
                {
                  proxyKind: "traefik",
                  domains: ["generated.example.test"],
                  pathPrefix: "/",
                  tlsMode: "disabled",
                  targetPort: 3000,
                },
              ],
              metadata: {
                "access.routeSource": "generated-default",
                "access.hostname": "generated.example.test",
                "access.providerKey": "test-provider",
                "access.scheme": "http",
              },
            },
          },
        },
      ],
      [
        {
          id: "dmb_bound",
          status: "bound",
          createdAt: "2026-01-01T01:05:00.000Z",
          domainName: "secure.example.com",
          pathPrefix: "/",
          proxyKind: "traefik",
          tlsMode: "auto",
        },
      ],
    );

    expect(summary?.latestDurableDomainRoute).toBeUndefined();
    expect(summary?.latestGeneratedAccessRoute?.hostname).toBe("generated.example.test");
  });

  test("[ROUTE-TLS-READMODEL-006] projects certificate-backed ready durable route as HTTPS", () => {
    const summary = projectResourceAccessSummary(
      [
        {
          id: "dep_new",
          status: "succeeded",
          createdAt: "2026-01-01T01:00:00.000Z",
          runtimePlan: {
            execution: {
              accessRoutes: [
                {
                  proxyKind: "traefik",
                  domains: ["generated.example.test"],
                  pathPrefix: "/",
                  tlsMode: "disabled",
                  targetPort: 3000,
                },
              ],
              metadata: {
                "access.routeSource": "generated-default",
                "access.hostname": "generated.example.test",
                "access.providerKey": "test-provider",
                "access.scheme": "http",
              },
            },
          },
        },
      ],
      [
        {
          id: "dmb_ready_tls",
          status: "ready",
          createdAt: "2026-01-01T01:05:00.000Z",
          domainName: "secure.example.com",
          pathPrefix: "/",
          proxyKind: "traefik",
          tlsMode: "auto",
        },
      ],
    );

    expect(summary?.latestDurableDomainRoute).toEqual({
      url: "https://secure.example.com",
      hostname: "secure.example.com",
      scheme: "https",
      providerKey: "test-provider",
      deploymentId: "dep_new",
      deploymentStatus: "succeeded",
      pathPrefix: "/",
      proxyKind: "traefik",
      targetPort: 3000,
      updatedAt: "2026-01-01T01:05:00.000Z",
    });
  });

  test("[DEF-ACCESS-QRY-002] keeps durable route realization ahead of newer server-applied route", () => {
    const summary = projectResourceAccessSummary(
      [
        {
          id: "dep_server_applied",
          status: "succeeded",
          createdAt: "2026-01-01T02:00:00.000Z",
          runtimePlan: {
            execution: {
              accessRoutes: [
                {
                  proxyKind: "traefik",
                  domains: ["server-applied.example.test"],
                  pathPrefix: "/",
                  tlsMode: "disabled",
                  targetPort: 3000,
                },
              ],
              metadata: {
                "access.routeSource": "server-applied-config-domain",
                "access.hostname": "server-applied.example.test",
                "access.scheme": "http",
              },
            },
          },
        },
        {
          id: "dep_durable",
          status: "succeeded",
          createdAt: "2026-01-01T01:00:00.000Z",
          runtimePlan: {
            execution: {
              accessRoutes: [
                {
                  proxyKind: "traefik",
                  domains: ["durable.example.test"],
                  pathPrefix: "/",
                  tlsMode: "disabled",
                  targetPort: 3000,
                },
              ],
              metadata: {
                "access.routeSource": "durable-domain-binding",
                "access.hostname": "durable.example.test",
                "access.scheme": "http",
              },
            },
          },
        },
      ],
      [
        {
          id: "dmb_ready",
          status: "ready",
          createdAt: "2026-01-01T01:05:00.000Z",
          domainName: "durable.example.test",
          pathPrefix: "/",
          proxyKind: "traefik",
          tlsMode: "disabled",
        },
      ],
    );

    expect(summary?.latestDurableDomainRoute).toMatchObject({
      hostname: "durable.example.test",
      deploymentId: "dep_durable",
    });
    expect(summary?.latestServerAppliedDomainRoute).toMatchObject({
      hostname: "server-applied.example.test",
      deploymentId: "dep_server_applied",
    });
    expect(summary?.lastRouteRealizationDeploymentId).toBe("dep_durable");
  });

  test("[ROUTE-INTENT-001][ROUTE-INTENT-002][ROUTE-INTENT-003] builds descriptor-compatible route sources in precedence order", () => {
    const accessSummary = {
      latestDurableDomainRoute: {
        url: "https://durable.example.test",
        hostname: "durable.example.test",
        scheme: "https" as const,
        deploymentId: "dep_durable",
        deploymentStatus: "succeeded" as const,
        pathPrefix: "/",
        proxyKind: "traefik" as const,
        targetPort: 3000,
        updatedAt: "2026-01-01T00:00:03.000Z",
      },
      latestServerAppliedDomainRoute: {
        url: "https://server-applied.example.test",
        hostname: "server-applied.example.test",
        scheme: "https" as const,
        deploymentId: "dep_server_applied",
        deploymentStatus: "succeeded" as const,
        pathPrefix: "/",
        proxyKind: "traefik" as const,
        targetPort: 3000,
        updatedAt: "2026-01-01T00:00:02.000Z",
      },
      latestGeneratedAccessRoute: {
        url: "http://generated.example.test",
        hostname: "generated.example.test",
        scheme: "http" as const,
        providerKey: "sslip",
        deploymentId: "dep_generated",
        deploymentStatus: "succeeded" as const,
        pathPrefix: "/",
        proxyKind: "traefik" as const,
        targetPort: 3000,
        updatedAt: "2026-01-01T00:00:01.000Z",
      },
      proxyRouteStatus: "ready" as const,
      lastRouteRealizationDeploymentId: "dep_durable",
    };

    const descriptors = routeIntentStatusDescriptors({
      resourceId: "res_web",
      accessSummary,
    });

    expect(descriptors.map((descriptor) => descriptor.source)).toEqual([
      "durable-domain-binding",
      "server-applied-route",
      "generated-default-access",
    ]);
    expect(selectedRouteIntentStatus({ resourceId: "res_web", accessSummary })).toMatchObject({
      source: "durable-domain-binding",
      intent: {
        host: "durable.example.test",
        protocol: "https",
      },
      proxy: {
        applied: "ready",
      },
      recommendedAction: "none",
    });
  });

  test("[ROUTE-STATUS-001][ROUTE-STATUS-004] maps route status observations to typed blocking reasons", () => {
    const descriptor = selectedRouteIntentStatus({
      resourceId: "res_web",
      accessSummary: {
        latestGeneratedAccessRoute: {
          url: "http://generated.example.test",
          hostname: "generated.example.test",
          scheme: "http",
          providerKey: "sslip",
          deploymentId: "dep_generated",
          deploymentStatus: "succeeded",
          pathPrefix: "/",
          proxyKind: "traefik",
          targetPort: 3000,
          updatedAt: "2026-01-01T00:00:01.000Z",
        },
        proxyRouteStatus: "failed",
        lastRouteRealizationDeploymentId: "dep_generated",
      },
    });

    expect(descriptor).toMatchObject({
      source: "generated-default-access",
      blockingReason: "proxy_route_stale",
      recommendedAction: "inspect-proxy-preview",
      copySafeSummary: {
        status: "failed",
        code: "proxy_route_stale",
        phase: "route-status-observation",
      },
    });
  });

  test("[EDGE-PROXY-ROUTE-005] projects latest server-applied config domain route", () => {
    const summary = projectResourceAccessSummary([
      {
        id: "dep_config_domain",
        status: "succeeded",
        createdAt: "2026-01-01T01:00:00.000Z",
        runtimePlan: {
          execution: {
            accessRoutes: [
              {
                proxyKind: "traefik",
                domains: ["www.example.test"],
                pathPrefix: "/",
                tlsMode: "disabled",
                targetPort: 3000,
              },
              {
                proxyKind: "traefik",
                domains: ["www.example.test"],
                pathPrefix: "/admin",
                tlsMode: "disabled",
                targetPort: 3000,
              },
            ],
            metadata: {
              "access.routeSource": "server-applied-config-domain",
              "access.serverAppliedRouteSetId": "prj_demo:env_demo:res_demo:srv_demo:dst_demo",
              "access.hostname": "www.example.test",
              "access.scheme": "http",
              "access.routeCount": "2",
              "access.routeGroupCount": "2",
            },
          },
        },
      },
    ]);

    expect(summary).toEqual({
      latestServerAppliedDomainRoute: {
        url: "http://www.example.test",
        hostname: "www.example.test",
        scheme: "http",
        deploymentId: "dep_config_domain",
        deploymentStatus: "succeeded",
        pathPrefix: "/",
        proxyKind: "traefik",
        targetPort: 3000,
        updatedAt: "2026-01-01T01:00:00.000Z",
      },
      proxyRouteStatus: "ready",
      lastRouteRealizationDeploymentId: "dep_config_domain",
    });
  });

  test("[EDGE-PROXY-ROUTE-007] projects failed server-applied config domain route status", () => {
    const summary = projectResourceAccessSummary([
      {
        id: "dep_config_domain_failed",
        status: "failed",
        createdAt: "2026-01-01T01:00:00.000Z",
        runtimePlan: {
          execution: {
            accessRoutes: [
              {
                proxyKind: "traefik",
                domains: ["www.example.test"],
                pathPrefix: "/",
                tlsMode: "auto",
                targetPort: 3000,
              },
            ],
            metadata: {
              "access.routeSource": "server-applied-config-domain",
              "access.hostname": "www.example.test",
              "access.scheme": "https",
            },
          },
        },
      },
    ]);

    expect(summary?.latestServerAppliedDomainRoute).toMatchObject({
      url: "https://www.example.test",
      hostname: "www.example.test",
      scheme: "https",
      deploymentId: "dep_config_domain_failed",
      deploymentStatus: "failed",
    });
    expect(summary?.proxyRouteStatus).toBe("failed");
    expect(summary?.lastRouteRealizationDeploymentId).toBe("dep_config_domain_failed");
  });
});
