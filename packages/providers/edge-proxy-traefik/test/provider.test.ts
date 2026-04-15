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

    expect(ensure.isOk()).toBe(true);
    expect(ensure._unsafeUnwrap()).toMatchObject({
      providerKey: "traefik",
      networkName: "yundu-edge",
      containerName: "yundu-traefik",
    });
    expect(realized.isOk()).toBe(true);
    expect(realized._unsafeUnwrap().labels).toContain("traefik.enable=true");
    expect(view.isOk()).toBe(true);
    expect(view._unsafeUnwrap().routes[0]?.source).toBe("generated-default");
    expect(view._unsafeUnwrap().sections[0]?.content).toContain(
      "traefik.http.services.planned-svc.loadbalancer.server.port=3000",
    );
  });
});
