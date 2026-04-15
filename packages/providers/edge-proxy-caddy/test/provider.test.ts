import { describe, expect, test } from "bun:test";
import { CaddyEdgeProxyProvider } from "../src";

describe("CaddyEdgeProxyProvider", () => {
  test("renders provider-owned Docker labels and ensure plan", async () => {
    const provider = new CaddyEdgeProxyProvider();
    const ensure = await provider.ensureProxy(
      { correlationId: "req_caddy_provider_test" },
      { proxyKind: "caddy" },
    );
    const realized = await provider.realizeRoutes(
      { correlationId: "req_caddy_provider_test" },
      {
        deploymentId: "dep_demo",
        port: 3000,
        accessRoutes: [
          {
            proxyKind: "caddy",
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
        correlationId: "req_caddy_provider_test",
      },
      {
        resourceId: "res_demo",
        routeScope: "planned",
        status: "planned",
        generatedAt: "2026-01-01T00:00:00.000Z",
        stale: false,
        accessRoutes: [
          {
            proxyKind: "caddy",
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
      providerKey: "caddy",
      networkName: "yundu-edge",
      containerName: "yundu-caddy",
    });
    expect(realized.isOk()).toBe(true);
    expect(realized._unsafeUnwrap().labels).toContain("caddy=http://app.203.0.113.10.sslip.io");
    expect(view.isOk()).toBe(true);
    expect(view._unsafeUnwrap().routes[0]?.source).toBe("generated-default");
    expect(view._unsafeUnwrap().sections[0]?.content).toContain("caddy.reverse_proxy");
  });
});
