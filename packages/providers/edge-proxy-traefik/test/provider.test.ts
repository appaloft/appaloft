import { describe, expect, test } from "bun:test";
import { TraefikEdgeProxyProvider } from "../src";

describe("TraefikEdgeProxyProvider", () => {
  test("renders provider-owned Docker labels and ensure plan", async () => {
    const provider = new TraefikEdgeProxyProvider();
    const ensure = await provider.ensureProxy(
      { correlationId: "req_traefik_provider_test" },
      { proxyKind: "traefik" },
    );
    const realized = await provider.realizeRoutes(
      { correlationId: "req_traefik_provider_test" },
      {
        deploymentId: "dep_demo",
        port: 3000,
        accessRoutes: [
          {
            proxyKind: "traefik",
            domains: ["app.203.0.113.10.sslip.io"],
            pathPrefix: "/",
            tlsMode: "disabled",
            targetPort: 3000,
          },
        ],
      },
    );
    expect(realized.isOk()).toBe(true);

    const reload = await provider.reloadProxy(
      { correlationId: "req_traefik_provider_test" },
      {
        proxyKind: "traefik",
        deploymentId: "dep_demo",
        reason: "route-realization",
        accessRoutes: [
          {
            proxyKind: "traefik",
            domains: ["app.203.0.113.10.sslip.io"],
            pathPrefix: "/",
            tlsMode: "disabled",
            targetPort: 3000,
          },
        ],
        routePlan: realized._unsafeUnwrap(),
      },
    );
    const view = await provider.renderConfigurationView(
      {
        correlationId: "req_traefik_provider_test",
      },
      {
        resourceId: "res_demo",
        routeScope: "planned",
        status: "planned",
        generatedAt: "2026-01-01T00:00:00.000Z",
        stale: false,
        accessRoutes: [
          {
            proxyKind: "traefik",
            domains: ["app.203.0.113.10.sslip.io"],
            pathPrefix: "/",
            tlsMode: "disabled",
            targetPort: 3000,
          },
        ],
        port: 3000,
        includeDiagnostics: true,
      },
    );
    const diagnostics = await provider.diagnoseProxy(
      { correlationId: "req_traefik_provider_test" },
      { proxyKind: "traefik" },
    );

    expect(ensure.isOk()).toBe(true);
    expect(ensure._unsafeUnwrap()).toMatchObject({
      providerKey: "traefik",
      networkName: "yundu-edge",
      containerName: "yundu-traefik",
    });
    expect(ensure._unsafeUnwrap().containerCommand).toContain("traefik:v3.6.2");
    expect(ensure._unsafeUnwrap().metadata).toMatchObject({
      image: "traefik:v3.6.2",
    });
    expect(diagnostics.isOk()).toBe(true);
    expect(diagnostics._unsafeUnwrap().checks.map((check) => check.name)).toEqual([
      "edge-proxy-container",
      "edge-proxy-provider-logs",
      "edge-proxy-route-probe",
    ]);
    expect(diagnostics._unsafeUnwrap().checks[0]?.command).toContain("traefik:v3.6.2");
    expect(diagnostics._unsafeUnwrap().checks[2]?.command).toContain("traefik.enable=true");
    expect(realized._unsafeUnwrap().labels).toContain("traefik.enable=true");
    expect(reload.isOk()).toBe(true);
    expect(reload._unsafeUnwrap()).toMatchObject({
      providerKey: "traefik",
      proxyKind: "traefik",
      required: true,
    });
    expect(reload._unsafeUnwrap().steps).toEqual([
      expect.objectContaining({
        name: "traefik-docker-provider-reload",
        mode: "automatic",
      }),
    ]);
    expect(view.isOk()).toBe(true);
    expect(view._unsafeUnwrap().routes[0]?.source).toBe("generated-default");
    expect(view._unsafeUnwrap().sections[0]?.content).toContain(
      "traefik.http.services.planned-svc.loadbalancer.server.port=3000",
    );
  });
});
