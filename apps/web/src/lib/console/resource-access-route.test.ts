import { describe, expect, test } from "vitest";

import { selectCurrentResourceAccessRoute } from "./resource-access-route";

describe("resource access route precedence", () => {
  test("[DEF-ACCESS-ENTRY-008] selects durable route before server-applied and generated routes", () => {
    const selected = selectCurrentResourceAccessRoute({
      latestDurableDomainRoute: {
        url: "https://durable.example.test",
        hostname: "durable.example.test",
        scheme: "https",
        deploymentId: "dep_durable",
        deploymentStatus: "succeeded",
        pathPrefix: "/",
        proxyKind: "traefik",
        updatedAt: "2026-01-01T00:03:00.000Z",
      },
      latestServerAppliedDomainRoute: {
        url: "https://server-applied.example.test",
        hostname: "server-applied.example.test",
        scheme: "https",
        deploymentId: "dep_server_applied",
        deploymentStatus: "succeeded",
        pathPrefix: "/",
        proxyKind: "traefik",
        updatedAt: "2026-01-01T00:02:00.000Z",
      },
      latestGeneratedAccessRoute: {
        url: "https://generated.example.test",
        hostname: "generated.example.test",
        scheme: "https",
        deploymentId: "dep_generated",
        deploymentStatus: "succeeded",
        pathPrefix: "/",
        proxyKind: "traefik",
        updatedAt: "2026-01-01T00:01:00.000Z",
      },
      proxyRouteStatus: "ready",
      lastRouteRealizationDeploymentId: "dep_durable",
    });

    expect(selected).toMatchObject({
      kind: "durable-domain",
      route: {
        url: "https://durable.example.test",
      },
    });
  });

  test("[DEF-ACCESS-ENTRY-008] selects server-applied route before generated routes", () => {
    const selected = selectCurrentResourceAccessRoute({
      latestServerAppliedDomainRoute: {
        url: "https://server-applied.example.test",
        hostname: "server-applied.example.test",
        scheme: "https",
        deploymentId: "dep_server_applied",
        deploymentStatus: "succeeded",
        pathPrefix: "/",
        proxyKind: "traefik",
        updatedAt: "2026-01-01T00:02:00.000Z",
      },
      latestGeneratedAccessRoute: {
        url: "https://generated.example.test",
        hostname: "generated.example.test",
        scheme: "https",
        deploymentId: "dep_generated",
        deploymentStatus: "succeeded",
        pathPrefix: "/",
        proxyKind: "traefik",
        updatedAt: "2026-01-01T00:01:00.000Z",
      },
      plannedGeneratedAccessRoute: {
        url: "https://planned.example.test",
        hostname: "planned.example.test",
        scheme: "https",
        pathPrefix: "/",
        proxyKind: "traefik",
        targetPort: 3000,
      },
      proxyRouteStatus: "ready",
      lastRouteRealizationDeploymentId: "dep_server_applied",
    });

    expect(selected).toMatchObject({
      kind: "server-applied-domain",
      route: {
        url: "https://server-applied.example.test",
      },
    });
  });

  test("[DEF-ACCESS-ENTRY-008] selects latest generated route before planned generated route", () => {
    const selected = selectCurrentResourceAccessRoute({
      latestGeneratedAccessRoute: {
        url: "https://generated.example.test",
        hostname: "generated.example.test",
        scheme: "https",
        deploymentId: "dep_generated",
        deploymentStatus: "succeeded",
        pathPrefix: "/",
        proxyKind: "traefik",
        updatedAt: "2026-01-01T00:01:00.000Z",
      },
      plannedGeneratedAccessRoute: {
        url: "https://planned.example.test",
        hostname: "planned.example.test",
        scheme: "https",
        pathPrefix: "/",
        proxyKind: "traefik",
        targetPort: 3000,
      },
      proxyRouteStatus: "ready",
      lastRouteRealizationDeploymentId: "dep_generated",
    });

    expect(selected).toMatchObject({
      kind: "generated-latest",
      route: {
        url: "https://generated.example.test",
      },
    });
  });
});
