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
    expect(realized.isOk()).toBe(true);

    const reload = await provider.reloadProxy(
      { correlationId: "req_caddy_provider_test" },
      {
        proxyKind: "caddy",
        deploymentId: "dep_demo",
        reason: "route-realization",
        accessRoutes: [
          {
            proxyKind: "caddy",
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
            appliedRouteContext: {
              schemaVersion: "applied-route-context/v1",
              resourceId: "res_demo",
              deploymentId: "dep_demo",
              serverId: "srv_demo",
              destinationId: "dst_demo",
              routeId: "generated-default:res_demo:dep_demo:app.203.0.113.10.sslip.io:/",
              diagnosticId: "generated-default:res_demo:dep_demo:app.203.0.113.10.sslip.io:/",
              routeSource: "generated-default",
              hostname: "app.203.0.113.10.sslip.io",
              pathPrefix: "/",
              proxyKind: "caddy",
              providerKey: "caddy",
              observedAt: "2026-01-01T00:00:00.000Z",
            },
          },
        ],
        port: 3000,
        includeDiagnostics: true,
      },
    );
    const diagnostics = await provider.diagnoseProxy(
      { correlationId: "req_caddy_provider_test" },
      { proxyKind: "caddy" },
    );

    expect(ensure.isOk()).toBe(true);
    expect(ensure._unsafeUnwrap()).toMatchObject({
      providerKey: "caddy",
      networkName: "appaloft-edge",
      containerName: "appaloft-caddy",
    });
    expect(ensure._unsafeUnwrap().metadata).toMatchObject({
      image: "lucaslorentz/caddy-docker-proxy:2.9-alpine",
    });
    expect(diagnostics.isOk()).toBe(true);
    expect(diagnostics._unsafeUnwrap().checks.map((check) => check.name)).toEqual([
      "edge-proxy-container",
      "edge-proxy-provider-logs",
    ]);
    expect(diagnostics._unsafeUnwrap().checks[0]?.command).toContain(
      "lucaslorentz/caddy-docker-proxy:2.9-alpine",
    );
    expect(realized._unsafeUnwrap().labels).toContain("caddy=http://app.203.0.113.10.sslip.io");
    expect(reload.isOk()).toBe(true);
    expect(reload._unsafeUnwrap()).toMatchObject({
      providerKey: "caddy",
      proxyKind: "caddy",
      required: true,
    });
    expect(reload._unsafeUnwrap().steps).toEqual([
      expect.objectContaining({
        name: "caddy-docker-provider-reload",
        mode: "automatic",
      }),
    ]);
    expect(view.isOk()).toBe(true);
    expect(view._unsafeUnwrap().routes[0]?.source).toBe("generated-default");
    expect(view._unsafeUnwrap().routes[0]?.appliedRouteContext).toMatchObject({
      schemaVersion: "applied-route-context/v1",
      resourceId: "res_demo",
      deploymentId: "dep_demo",
      routeSource: "generated-default",
      hostname: "app.203.0.113.10.sslip.io",
      proxyKind: "caddy",
      providerKey: "caddy",
    });
    expect(view._unsafeUnwrap().diagnostics?.appliedRouteContexts?.[0]).toMatchObject({
      resourceId: "res_demo",
      routeSource: "generated-default",
    });
    expect(view._unsafeUnwrap().sections[0]?.content).toContain("caddy.reverse_proxy");
  });

  test("[EDGE-PROXY-ROUTE-006] reports provider-local TLS diagnostics for TLS auto routes", async () => {
    const provider = new CaddyEdgeProxyProvider();
    const realized = await provider.realizeRoutes(
      { correlationId: "req_caddy_tls_diagnostic_test" },
      {
        deploymentId: "dep_tls",
        port: 3000,
        accessRoutes: [
          {
            proxyKind: "caddy",
            domains: ["www.example.test"],
            pathPrefix: "/",
            tlsMode: "auto",
            targetPort: 3000,
          },
        ],
      },
    );
    const view = await provider.renderConfigurationView(
      {
        correlationId: "req_caddy_tls_diagnostic_test",
      },
      {
        resourceId: "res_tls",
        deploymentId: "dep_tls",
        routeScope: "deployment-snapshot",
        status: "applied",
        generatedAt: "2026-01-01T00:00:00.000Z",
        stale: false,
        accessRoutes: [
          {
            proxyKind: "caddy",
            domains: ["www.example.test"],
            pathPrefix: "/",
            tlsMode: "auto",
            targetPort: 3000,
          },
        ],
        port: 3000,
        includeDiagnostics: true,
      },
    );

    expect(realized.isOk()).toBe(true);
    expect(realized._unsafeUnwrap().labels).toContain("caddy=https://www.example.test");
    expect(view.isOk()).toBe(true);
    expect(view._unsafeUnwrap().diagnostics?.tlsRoutes).toEqual([
      expect.objectContaining({
        hostname: "www.example.test",
        pathPrefix: "/",
        tlsMode: "auto",
        scheme: "https",
        automation: "provider-local",
        certificateSource: "provider-local",
        appaloftCertificateManaged: false,
      }),
    ]);
  });

  test("[EDGE-PROXY-ROUTE-008] renders canonical redirect aliases without proxying alias hosts", async () => {
    const provider = new CaddyEdgeProxyProvider();
    const accessRoutes = [
      {
        proxyKind: "caddy" as const,
        domains: ["example.test"],
        pathPrefix: "/",
        tlsMode: "auto" as const,
        targetPort: 3000,
      },
      {
        proxyKind: "caddy" as const,
        domains: ["www.example.test"],
        pathPrefix: "/",
        tlsMode: "auto" as const,
        redirectTo: "example.test",
        redirectStatus: 308 as const,
      },
    ];

    const realized = await provider.realizeRoutes(
      { correlationId: "req_caddy_canonical_redirect_test" },
      {
        deploymentId: "dep_canonical",
        port: 3000,
        accessRoutes,
      },
    );

    expect(realized.isOk()).toBe(true);
    const labels = realized._unsafeUnwrap().labels.join("\n");
    expect(labels).toContain("www.example.test");
    expect(labels).toContain("example.test");
    expect(labels).toContain("redir");
    expect(labels).toContain("308");
    expect(labels).not.toContain("caddy_1.reverse_proxy");
  });

  test("[EDGE-PROXY-QRY-007] exposes canonical redirect route views", async () => {
    const provider = new CaddyEdgeProxyProvider();
    const accessRoutes = [
      {
        proxyKind: "caddy" as const,
        domains: ["example.test"],
        pathPrefix: "/",
        tlsMode: "auto" as const,
        targetPort: 3000,
      },
      {
        proxyKind: "caddy" as const,
        domains: ["www.example.test"],
        pathPrefix: "/",
        tlsMode: "auto" as const,
        redirectTo: "example.test",
        redirectStatus: 308 as const,
      },
    ];

    const view = await provider.renderConfigurationView(
      { correlationId: "req_caddy_canonical_redirect_view_test" },
      {
        resourceId: "res_canonical",
        deploymentId: "dep_canonical",
        routeScope: "deployment-snapshot",
        status: "applied",
        generatedAt: "2026-01-01T00:00:00.000Z",
        stale: false,
        accessRoutes,
        port: 3000,
        includeDiagnostics: true,
      },
    );

    expect(view.isOk()).toBe(true);
    expect(view._unsafeUnwrap().routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          hostname: "www.example.test",
          routeBehavior: "redirect",
          redirectTo: "example.test",
          redirectStatus: 308,
        }),
      ]),
    );
  });
});
