import { describe, expect, test } from "bun:test";
import { projectResourceAccessSummary } from "../src/operations/resources/resource-access-summary.projector";

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
});
