import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeploymentTargetId,
  DeploymentTargetName,
  EdgeProxyKindValue,
  EdgeProxyStatusValue,
  HostAddress,
  PortNumber,
  ProviderKey,
  TargetKindValue,
  domainError,
  err,
  ok,
  type DeploymentTargetState,
  type Result,
} from "@appaloft/core";
import {
  type EdgeProxyDiagnosticsInput,
  type EdgeProxyDiagnosticsPlan,
  type EdgeProxyEnsureInput,
  type EdgeProxyEnsurePlan,
  type EdgeProxyExecutionContext,
  type EdgeProxyProvider,
  type EdgeProxyProviderRegistry,
  type ExecutionContext,
  type ProxyConfigurationView,
  type ProxyConfigurationViewInput,
  type ProxyReloadInput,
  type ProxyReloadPlan,
  type ProxyRouteRealizationInput,
  type ProxyRouteRealizationPlan,
} from "@appaloft/application";
import { RuntimeServerConnectivityChecker } from "../src/server-connectivity";

class DiagnosticProvider implements EdgeProxyProvider {
  readonly key = "traefik";
  readonly displayName = "Traefik";
  readonly capabilities = {
    ensureProxy: true,
    dockerLabels: true,
    reloadProxy: true,
    configurationView: true,
    runtimeLogs: false,
    diagnostics: true,
  };

  constructor(private readonly diagnosticCommand = "printf edge-proxy-ok") {}

  async ensureProxy(
    _context: EdgeProxyExecutionContext,
    _input: EdgeProxyEnsureInput,
  ): Promise<Result<EdgeProxyEnsurePlan>> {
    return err(domainError.provider("not used"));
  }

  async diagnoseProxy(
    _context: EdgeProxyExecutionContext,
    input: EdgeProxyDiagnosticsInput,
  ): Promise<Result<EdgeProxyDiagnosticsPlan>> {
    return ok({
      providerKey: this.key,
      proxyKind: input.proxyKind,
      displayName: this.displayName,
      checks: [
        {
          name: "edge-proxy-route-probe",
          command: this.diagnosticCommand,
          timeoutMs: 1_000,
          successMessage: "Proxy route probe passed",
          failureMessage: "Proxy route probe failed",
          metadata: {
            probe: "fake",
          },
        },
      ],
    });
  }

  async realizeRoutes(
    _context: EdgeProxyExecutionContext,
    _input: ProxyRouteRealizationInput,
  ): Promise<Result<ProxyRouteRealizationPlan>> {
    return err(domainError.provider("not used"));
  }

  async reloadProxy(
    _context: EdgeProxyExecutionContext,
    input: ProxyReloadInput,
  ): Promise<Result<ProxyReloadPlan>> {
    return ok({
      providerKey: this.key,
      proxyKind: input.proxyKind,
      displayName: this.displayName,
      required: false,
      steps: [],
    });
  }

  async renderConfigurationView(
    _context: EdgeProxyExecutionContext,
    _input: ProxyConfigurationViewInput,
  ): Promise<Result<ProxyConfigurationView>> {
    return err(domainError.provider("not used"));
  }
}

class StaticProviderRegistry implements EdgeProxyProviderRegistry {
  constructor(private readonly provider: EdgeProxyProvider) {}

  resolve(): Result<EdgeProxyProvider> {
    return ok(this.provider);
  }

  defaultFor(): Result<EdgeProxyProvider | null> {
    return ok(this.provider);
  }
}

function createServer(): DeploymentTargetState {
  return {
    id: DeploymentTargetId.rehydrate("srv_demo"),
    name: DeploymentTargetName.rehydrate("demo"),
    host: HostAddress.rehydrate("127.0.0.1"),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate("local-shell"),
    targetKind: TargetKindValue.rehydrate("single-server"),
    edgeProxy: {
      kind: EdgeProxyKindValue.rehydrate("traefik"),
      status: EdgeProxyStatusValue.rehydrate("ready"),
    },
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  };
}

function createSwarmServer(): DeploymentTargetState {
  return {
    id: DeploymentTargetId.rehydrate("srv_swarm"),
    name: DeploymentTargetName.rehydrate("swarm"),
    host: HostAddress.rehydrate("deploy@swarm-manager.internal"),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate("docker-swarm"),
    targetKind: TargetKindValue.rehydrate("orchestrator-cluster"),
    edgeProxy: {
      kind: EdgeProxyKindValue.rehydrate("none"),
      status: EdgeProxyStatusValue.rehydrate("disabled"),
    },
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  };
}

function createContext(): ExecutionContext {
  return {
    requestId: "req_server_connectivity",
    entrypoint: "system",
    locale: "en",
    t: ((key: string) => key) as ExecutionContext["t"],
    tracer: {
      startActiveSpan(_name, _options, callback) {
        return Promise.resolve(
          callback({
            addEvent() {},
            recordError() {},
            setAttribute() {},
            setAttributes() {},
            setStatus() {},
          }),
        );
      },
    },
  };
}

describe("RuntimeServerConnectivityChecker", () => {
  test("includes provider-rendered edge proxy diagnostics in server doctor checks", async () => {
    const checker = new RuntimeServerConnectivityChecker(
      new StaticProviderRegistry(new DiagnosticProvider()),
    );
    const result = await checker.test(createContext(), {
      server: createServer(),
    });

    expect(result.isOk()).toBe(true);
    const checks = result._unsafeUnwrap().checks;
    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "edge-proxy-route-probe",
          status: "passed",
          metadata: expect.objectContaining({
            providerKey: "traefik",
            proxyKind: "traefik",
            probe: "fake",
          }),
        }),
      ]),
    );
  });

  test("adds an explicit repair command hint when edge proxy diagnostics fail", async () => {
    const checker = new RuntimeServerConnectivityChecker(
      new StaticProviderRegistry(new DiagnosticProvider("exit 1")),
    );
    const result = await checker.test(createContext(), {
      server: createServer(),
    });

    expect(result.isOk()).toBe(true);
    const checks = result._unsafeUnwrap().checks;
    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "edge-proxy-route-probe",
          status: "failed",
          metadata: expect.objectContaining({
            providerKey: "traefik",
            proxyKind: "traefik",
            repairCommand: "appaloft server proxy repair srv_demo",
          }),
        }),
      ]),
    );
  });

  test("[SWARM-TARGET-REG-002] checks Docker Swarm manager readiness through SSH", async () => {
    const capturedCommands: string[] = [];
    const checker = new RuntimeServerConnectivityChecker(undefined, (command, args) => {
      capturedCommands.push([command, ...args].join(" "));
      return {
        status: 0,
        stdout: "ok",
        stderr: "",
      };
    });
    const result = await checker.test(createContext(), {
      server: createSwarmServer(),
    });

    expect(result.isOk()).toBe(true);
    const connectivity = result._unsafeUnwrap();
    expect(connectivity.status).toBe("healthy");
    expect(connectivity.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "ssh",
          status: "passed",
          metadata: expect.objectContaining({
            providerKey: "docker-swarm",
            targetKind: "orchestrator-cluster",
          }),
        }),
        expect.objectContaining({
          name: "docker",
          status: "passed",
        }),
        expect.objectContaining({
          name: "swarm-manager",
          status: "passed",
        }),
        expect.objectContaining({
          name: "swarm-overlay-network",
          status: "passed",
        }),
        expect.objectContaining({
          name: "swarm-edge-proxy",
          status: "skipped",
        }),
      ]),
    );
    expect(capturedCommands.join("\n")).toContain("docker info");
    expect(capturedCommands.join("\n")).not.toContain("docker stack");
    expect(capturedCommands.join("\n")).not.toContain("docker service");
    expect(capturedCommands.join("\n")).not.toContain("docker network create");
  });
});
