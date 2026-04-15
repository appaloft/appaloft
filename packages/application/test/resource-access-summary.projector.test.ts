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
});
