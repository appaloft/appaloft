import { describe, expect, test } from "bun:test";
import { renderTraefikResourceAccessFailureMiddleware, TraefikEdgeProxyProvider } from "../src";

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
      networkName: "appaloft-edge",
      containerName: "appaloft-traefik",
    });
    expect(ensure._unsafeUnwrap().containerCommand).toContain("traefik:v3.6.2");
    expect(ensure._unsafeUnwrap().containerCommand).toContain(
      "--add-host host.docker.internal:host-gateway",
    );
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

  test("[EDGE-PROXY-ROUTE-006] reports provider-local TLS diagnostics for TLS auto routes", async () => {
    const provider = new TraefikEdgeProxyProvider();
    const realized = await provider.realizeRoutes(
      { correlationId: "req_traefik_tls_diagnostic_test" },
      {
        deploymentId: "dep_tls",
        port: 3000,
        accessRoutes: [
          {
            proxyKind: "traefik",
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
        correlationId: "req_traefik_tls_diagnostic_test",
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
            proxyKind: "traefik",
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
    expect(realized._unsafeUnwrap().labels).toEqual(
      expect.arrayContaining([
        "traefik.http.routers.dep-tls.entrypoints=websecure",
        "traefik.http.routers.dep-tls.tls=true",
      ]),
    );
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
    const provider = new TraefikEdgeProxyProvider();
    const accessRoutes = [
      {
        proxyKind: "traefik" as const,
        domains: ["example.test"],
        pathPrefix: "/",
        tlsMode: "auto" as const,
        targetPort: 3000,
      },
      {
        proxyKind: "traefik" as const,
        domains: ["www.example.test"],
        pathPrefix: "/",
        tlsMode: "auto" as const,
        redirectTo: "example.test",
        redirectStatus: 308 as const,
      },
    ];

    const realized = await provider.realizeRoutes(
      { correlationId: "req_traefik_canonical_redirect_test" },
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
    expect(labels).toContain("redirect");
    expect(labels).toContain("308");
    expect(labels).not.toContain("dep-canonical-1-svc.loadbalancer");
  });

  test("[EDGE-PROXY-QRY-007] exposes canonical redirect route views", async () => {
    const provider = new TraefikEdgeProxyProvider();
    const accessRoutes = [
      {
        proxyKind: "traefik" as const,
        domains: ["example.test"],
        pathPrefix: "/",
        tlsMode: "auto" as const,
        targetPort: 3000,
      },
      {
        proxyKind: "traefik" as const,
        domains: ["www.example.test"],
        pathPrefix: "/",
        tlsMode: "auto" as const,
        redirectTo: "example.test",
        redirectStatus: 308 as const,
      },
    ];

    const view = await provider.renderConfigurationView(
      { correlationId: "req_traefik_canonical_redirect_view_test" },
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

  test("[EDGE-PROXY-PROVIDER-010] renders provider-neutral access failure middleware labels", () => {
    const config = renderTraefikResourceAccessFailureMiddleware({
      middlewareName: "appaloft-errors",
      rendererPath: "/.appaloft/resource-access-failure",
      serviceName: "appaloft-backend",
      serviceUrl: "http://appaloft.internal:3001",
    });

    expect(config).toMatchObject({
      middlewareName: "appaloft-errors",
      serviceName: "appaloft-backend",
      query: "/.appaloft/resource-access-failure?status={status}",
      serviceUrl: "http://appaloft.internal:3001",
      statusList: "404,502,503,504",
    });
    expect(config.labels).toEqual([
      "traefik.http.middlewares.appaloft-errors.errors.status=404,502,503,504",
      "traefik.http.middlewares.appaloft-errors.errors.service=appaloft-backend",
      "traefik.http.middlewares.appaloft-errors.errors.query=/.appaloft/resource-access-failure?status={status}",
      "traefik.http.services.appaloft-backend.loadbalancer.server.url=http://appaloft.internal:3001",
      "traefik.http.services.appaloft-backend.loadbalancer.passhostheader=false",
    ]);
    expect(config.labels.join("\n")).not.toContain("resource_access_upstream_timeout");
  });

  test("[RES-ACCESS-DIAG-ROUTE-001] attaches access failure middleware to served routes only", async () => {
    const provider = new TraefikEdgeProxyProvider();
    const accessRoutes = [
      {
        proxyKind: "traefik" as const,
        domains: ["example.test"],
        pathPrefix: "/",
        tlsMode: "disabled" as const,
        targetPort: 3000,
      },
      {
        proxyKind: "traefik" as const,
        domains: ["www.example.test"],
        pathPrefix: "/",
        tlsMode: "disabled" as const,
        redirectTo: "example.test",
        redirectStatus: 308 as const,
      },
    ];

    const realized = await provider.realizeRoutes(
      { correlationId: "req_traefik_access_failure_route_test" },
      {
        deploymentId: "dep_access_failure",
        port: 3000,
        accessRoutes,
        resourceAccessFailureRenderer: {
          url: "http://appaloft.internal:3001",
          middlewareName: "appaloft-access-errors",
          serviceName: "appaloft-backend",
        },
      },
    );
    const view = await provider.renderConfigurationView(
      { correlationId: "req_traefik_access_failure_view_test" },
      {
        resourceId: "res_access_failure",
        deploymentId: "dep_access_failure",
        routeScope: "deployment-snapshot",
        status: "applied",
        generatedAt: "2026-04-20T00:00:00.000Z",
        stale: false,
        accessRoutes,
        port: 3000,
        includeDiagnostics: true,
        resourceAccessFailureRenderer: {
          url: "http://appaloft.internal:3001/ignored/path?token=secret",
          middlewareName: "appaloft-access-errors",
          serviceName: "appaloft-backend",
        },
      },
    );

    expect(realized.isOk()).toBe(true);
    const labels = realized._unsafeUnwrap().labels;
    expect(labels).toEqual(
      expect.arrayContaining([
        "traefik.http.routers.dep-access-failure.middlewares=appaloft-access-errors",
        "traefik.http.routers.dep-access-failure-1.middlewares=dep-access-failure-1-redirect",
        "traefik.http.middlewares.appaloft-access-errors.errors.status=404,502,503,504",
        "traefik.http.middlewares.appaloft-access-errors.errors.service=appaloft-backend",
        "traefik.http.middlewares.appaloft-access-errors.errors.query=/.appaloft/resource-access-failure?status={status}",
        "traefik.http.services.appaloft-backend.loadbalancer.server.url=http://appaloft.internal:3001",
        "traefik.http.services.appaloft-backend.loadbalancer.passhostheader=false",
      ]),
    );
    expect(labels).not.toContain(
      "traefik.http.routers.dep-access-failure-1.middlewares=appaloft-access-errors",
    );
    expect(
      labels.filter(
        (label) =>
          label === "traefik.http.middlewares.appaloft-access-errors.errors.status=404,502,503,504",
      ),
    ).toHaveLength(1);
    expect(realized._unsafeUnwrap().metadata).toMatchObject({
      routeCount: "2",
      resourceAccessFailureMiddleware: "appaloft-access-errors",
    });
    expect(view.isOk()).toBe(true);
    const content = view._unsafeUnwrap().sections[0]?.content ?? "";
    expect(content).toContain(
      "traefik.http.routers.dep-access-failure.middlewares=appaloft-access-errors",
    );
    expect(content).toContain(
      "traefik.http.services.appaloft-backend.loadbalancer.server.url=http://appaloft.internal:3001",
    );
    expect(content).not.toContain("token=secret");
  });

  test("[RES-ACCESS-DIAG-ROUTE-004] renders a low-priority route-not-found fallback when a renderer target is available", async () => {
    const provider = new TraefikEdgeProxyProvider();

    const realized = await provider.realizeRoutes(
      { correlationId: "req_traefik_route_not_found_fallback_test" },
      {
        deploymentId: "dep_route_not_found",
        port: 3000,
        accessRoutes: [
          {
            proxyKind: "traefik" as const,
            domains: ["app.example.test"],
            pathPrefix: "/",
            tlsMode: "auto" as const,
            targetPort: 3000,
          },
        ],
        resourceAccessFailureRenderer: {
          url: "http://appaloft.internal:3001/.appaloft/resource-access-failure?token=secret",
        },
      },
    );

    expect(realized.isOk()).toBe(true);
    const labels = realized._unsafeUnwrap().labels;
    expect(labels).toEqual(
      expect.arrayContaining([
        "traefik.http.routers.dep-route-not-found-route-not-found.rule=PathPrefix(`/`) && !PathPrefix(`/.well-known/acme-challenge/`)",
        "traefik.http.routers.dep-route-not-found-route-not-found.entrypoints=web",
        "traefik.http.routers.dep-route-not-found-route-not-found.priority=1",
        "traefik.http.routers.dep-route-not-found-route-not-found.middlewares=dep-route-not-found-route-not-found-rewrite,dep-route-not-found-route-not-found-headers",
        "traefik.http.routers.dep-route-not-found-route-not-found.service=dep-route-not-found-route-not-found-svc",
        "traefik.http.routers.dep-route-not-found-route-not-found-tls.rule=PathPrefix(`/`) && !PathPrefix(`/.well-known/acme-challenge/`)",
        "traefik.http.routers.dep-route-not-found-route-not-found-tls.entrypoints=websecure",
        "traefik.http.routers.dep-route-not-found-route-not-found-tls.tls=true",
        "traefik.http.routers.dep-route-not-found-route-not-found-tls.priority=1",
        "traefik.http.middlewares.dep-route-not-found-route-not-found-rewrite.replacepath.path=/.appaloft/resource-access-failure",
        "traefik.http.middlewares.dep-route-not-found-route-not-found-headers.headers.customrequestheaders.X-Appaloft-Resource-Access-Signal=route-not-found",
        "traefik.http.services.dep-route-not-found-route-not-found-svc.loadbalancer.server.url=http://appaloft.internal:3001",
        "traefik.http.services.dep-route-not-found-route-not-found-svc.loadbalancer.passhostheader=false",
      ]),
    );
    expect(labels.join("\n")).not.toContain("token=secret");
    expect(realized._unsafeUnwrap().metadata).toMatchObject({
      routeCount: "1",
      routeNotFoundFallback: "enabled",
    });
  });
});
