import { describe, expect, test } from "bun:test";
import {
  type EdgeProxyDiagnosticsInput,
  type EdgeProxyDiagnosticsPlan,
  type EdgeProxyEnsureInput,
  type EdgeProxyEnsurePlan,
  type EdgeProxyExecutionContext,
  type EdgeProxyProvider,
  type EdgeProxyProviderRegistry,
  type EdgeProxyProviderSelectionInput,
  type ProxyConfigurationView,
  type ProxyConfigurationViewInput,
  type ProxyReloadInput,
  type ProxyReloadPlan,
  type ProxyRouteRealizationInput,
  type ProxyRouteRealizationPlan,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import {
  createProxyReloadPlan,
  createProxyRouteRealizationPlan,
} from "../src/edge-proxy-plans";

class ReloadAwareProvider implements EdgeProxyProvider {
  readonly key = "traefik";
  readonly displayName = "Traefik";
  readonly capabilities = {
    ensureProxy: true,
    dockerLabels: true,
    reloadProxy: true,
    configurationView: true,
    runtimeLogs: false,
    diagnostics: false,
  };

  lastReloadInput: ProxyReloadInput | null = null;

  async ensureProxy(
    _context: EdgeProxyExecutionContext,
    _input: EdgeProxyEnsureInput,
  ): Promise<Result<EdgeProxyEnsurePlan>> {
    return err(domainError.provider("not used"));
  }

  async diagnoseProxy(
    _context: EdgeProxyExecutionContext,
    _input: EdgeProxyDiagnosticsInput,
  ): Promise<Result<EdgeProxyDiagnosticsPlan>> {
    return err(domainError.provider("not used"));
  }

  async realizeRoutes(
    _context: EdgeProxyExecutionContext,
    _input: ProxyRouteRealizationInput,
  ): Promise<Result<ProxyRouteRealizationPlan>> {
    return ok({
      providerKey: this.key,
      networkName: "appaloft-edge",
      labels: ["traefik.enable=true"],
    });
  }

  async reloadProxy(
    _context: EdgeProxyExecutionContext,
    input: ProxyReloadInput,
  ): Promise<Result<ProxyReloadPlan>> {
    this.lastReloadInput = input;
    return ok({
      providerKey: this.key,
      proxyKind: input.proxyKind,
      displayName: this.displayName,
      required: true,
      steps: [
        {
          name: "test-reload",
          mode: "command",
          command: "printf reload-ok",
          timeoutMs: 5_000,
          successMessage: "Reloaded proxy",
          failureMessage: "Proxy reload failed",
        },
      ],
    });
  }

  async renderConfigurationView(
    _context: EdgeProxyExecutionContext,
    _input: ProxyConfigurationViewInput,
  ): Promise<Result<ProxyConfigurationView>> {
    return err(domainError.provider("not used"));
  }
}

class StaticRegistry implements EdgeProxyProviderRegistry {
  constructor(private readonly provider: EdgeProxyProvider) {}

  resolve(key: string): Result<EdgeProxyProvider> {
    return key === this.provider.key
      ? ok(this.provider)
      : err(domainError.proxyProviderUnavailable("missing provider"));
  }

  defaultFor(input: EdgeProxyProviderSelectionInput): Result<EdgeProxyProvider | null> {
    if (!input.proxyKind || input.proxyKind === "none") {
      return ok(null);
    }

    return this.resolve(input.providerKey ?? input.proxyKind);
  }
}

describe("edge proxy plans", () => {
  test("EDGE-PROXY-PROVIDER-009 resolves provider-owned reload plans from route realization", async () => {
    const provider = new ReloadAwareProvider();
    const registry = new StaticRegistry(provider);
    const accessRoutes = [
      {
        proxyKind: "traefik" as const,
        domains: ["app.example.test"],
        pathPrefix: "/",
        tlsMode: "disabled" as const,
        targetPort: 3000,
      },
    ];

    const routePlan = await createProxyRouteRealizationPlan({
      providerRegistry: registry,
      context: { correlationId: "req_proxy_reload_plan_test" },
      deploymentId: "dep_reload",
      port: 3000,
      accessRoutes,
    });

    expect(routePlan.isOk()).toBe(true);

    const reloadPlan = await createProxyReloadPlan({
      providerRegistry: registry,
      context: { correlationId: "req_proxy_reload_plan_test" },
      deploymentId: "dep_reload",
      accessRoutes,
      routePlan: routePlan._unsafeUnwrap(),
      reason: "route-realization",
    });

    expect(reloadPlan.isOk()).toBe(true);
    expect(reloadPlan._unsafeUnwrap()?.steps[0]).toMatchObject({
      name: "test-reload",
      mode: "command",
      command: "printf reload-ok",
    });
    expect(provider.lastReloadInput?.routePlan.labels).toEqual(["traefik.enable=true"]);
  });
});
