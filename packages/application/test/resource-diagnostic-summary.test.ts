import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { domainError, err, ok, type Result } from "@appaloft/core";

import { createExecutionContext, type ExecutionContext, type toRepositoryContext } from "../src";
import { ResourceDiagnosticSummaryQuery } from "../src/messages";
import {
  type DefaultAccessDomainProvider,
  type DeploymentLogSummary,
  type DeploymentReadModel,
  type DeploymentSummary,
  type DestinationRepository,
  type DiagnosticsPort,
  type EdgeProxyEnsureInput,
  type EdgeProxyEnsurePlan,
  type EdgeProxyExecutionContext,
  type EdgeProxyProvider,
  type EdgeProxyProviderRegistry,
  type ProxyConfigurationView,
  type ProxyConfigurationViewInput,
  type ProxyReloadInput,
  type ProxyReloadPlan,
  type ProxyRouteRealizationInput,
  type ProxyRouteRealizationPlan,
  type ResourceReadModel,
  type ResourceRuntimeLogContext,
  type ResourceRuntimeLogEvent,
  type ResourceRuntimeLogReader,
  type ResourceRuntimeLogRequest,
  type ResourceRuntimeLogStream,
  type ResourceSummary,
  type ServerRepository,
} from "../src/ports";
import {
  ListResourcesQueryService,
  ResourceDiagnosticSummaryQueryService,
  ResourceProxyConfigurationPreviewQueryService,
  ResourceRuntimeLogsQueryService,
} from "../src/use-cases";

class FixedClock {
  now(): string {
    return "2026-01-01T00:00:10.000Z";
  }
}

class StaticResourceReadModel implements ResourceReadModel {
  constructor(private readonly resources: ResourceSummary[]) {}

  async list(): Promise<ResourceSummary[]> {
    return this.resources;
  }
}

class StaticDeploymentReadModel implements DeploymentReadModel {
  constructor(
    private readonly deployments: DeploymentSummary[],
    private readonly deploymentLogs: DeploymentLogSummary[] = [],
  ) {}

  async list(
    _context: ReturnType<typeof toRepositoryContext>,
    input?: {
      projectId?: string;
      resourceId?: string;
    },
  ): Promise<DeploymentSummary[]> {
    return this.deployments
      .filter((deployment) => (input?.projectId ? deployment.projectId === input.projectId : true))
      .filter((deployment) =>
        input?.resourceId ? deployment.resourceId === input.resourceId : true,
      );
  }

  async findLogs(): Promise<DeploymentLogSummary[]> {
    return this.deploymentLogs;
  }
}

class EmptyDestinationRepository implements DestinationRepository {
  async findOne(): Promise<null> {
    return null;
  }

  async upsert(): Promise<void> {}
}

class EmptyServerRepository implements ServerRepository {
  async findOne(): Promise<null> {
    return null;
  }

  async upsert(): Promise<void> {}
}

class DisabledDefaultAccessDomainProvider implements DefaultAccessDomainProvider {
  async generate() {
    return ok({
      kind: "disabled" as const,
      reason: "test-disabled",
    });
  }
}

class StaticRuntimeLogStream implements ResourceRuntimeLogStream {
  closed = false;

  constructor(private readonly events: ResourceRuntimeLogEvent[]) {}

  async close(): Promise<void> {
    this.closed = true;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<ResourceRuntimeLogEvent> {
    for (const event of this.events) {
      if (this.closed) {
        return;
      }

      yield event;
    }
  }
}

class RecordingRuntimeLogReader implements ResourceRuntimeLogReader {
  calls: ResourceRuntimeLogRequest[] = [];

  constructor(private readonly stream: ResourceRuntimeLogStream) {}

  async open(
    _context: ExecutionContext,
    _logContext: ResourceRuntimeLogContext,
    request: ResourceRuntimeLogRequest,
  ): Promise<Result<ResourceRuntimeLogStream>> {
    this.calls.push(request);
    return ok(this.stream);
  }
}

class MissingEdgeProxyProviderRegistry implements EdgeProxyProviderRegistry {
  resolve(): Result<EdgeProxyProvider> {
    return err(domainError.proxyProviderUnavailable("missing provider"));
  }

  defaultFor(): Result<EdgeProxyProvider | null> {
    return ok(null);
  }
}

class UnregisteredEdgeProxyProviderRegistry implements EdgeProxyProviderRegistry {
  resolve(): Result<EdgeProxyProvider> {
    return err(domainError.proxyProviderUnavailable("Edge proxy provider is not registered"));
  }

  defaultFor(): Result<EdgeProxyProvider | null> {
    return err(domainError.proxyProviderUnavailable("Edge proxy provider is not registered"));
  }
}

class TlsDiagnosticEdgeProxyProvider implements EdgeProxyProvider {
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

  async ensureProxy(
    _context: EdgeProxyExecutionContext,
    _input: EdgeProxyEnsureInput,
  ): Promise<Result<EdgeProxyEnsurePlan>> {
    return err(domainError.provider("not used"));
  }

  async diagnoseProxy(): Promise<Result<never>> {
    return err(domainError.provider("not used"));
  }

  async realizeRoutes(
    _context: EdgeProxyExecutionContext,
    input: ProxyRouteRealizationInput,
  ): Promise<Result<ProxyRouteRealizationPlan>> {
    return ok({
      providerKey: this.key,
      networkName: "appaloft-edge",
      labels: [
        `traefik.http.services.${input.deploymentId}.loadbalancer.server.port=${input.port}`,
      ],
    });
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
    input: ProxyConfigurationViewInput,
  ): Promise<Result<ProxyConfigurationView>> {
    return ok({
      resourceId: input.resourceId,
      ...(input.deploymentId ? { deploymentId: input.deploymentId } : {}),
      providerKey: this.key,
      routeScope: input.routeScope,
      status: input.status,
      generatedAt: input.generatedAt,
      stale: input.stale,
      routes: [],
      sections: [],
      warnings: [],
      diagnostics: {
        providerKey: this.key,
        routeCount: input.accessRoutes.length,
        tlsRoutes: input.accessRoutes.flatMap((route) =>
          route.domains.map((hostname) => ({
            hostname,
            pathPrefix: route.pathPrefix,
            tlsMode: route.tlsMode,
            scheme: route.tlsMode === "auto" ? ("https" as const) : ("http" as const),
            automation:
              route.tlsMode === "auto" ? ("provider-local" as const) : ("disabled" as const),
            certificateSource:
              route.tlsMode === "auto" ? ("provider-local" as const) : ("none" as const),
            appaloftCertificateManaged: false,
            message: "TLS is handled by the resident edge proxy provider",
          })),
        ),
      },
    });
  }
}

class StaticEdgeProxyProviderRegistry implements EdgeProxyProviderRegistry {
  constructor(private readonly provider: EdgeProxyProvider) {}

  resolve(): Result<EdgeProxyProvider> {
    return ok(this.provider);
  }

  defaultFor(): Result<EdgeProxyProvider | null> {
    return ok(this.provider);
  }
}

class StaticDiagnosticsPort implements DiagnosticsPort {
  async readiness() {
    return {
      status: "ready" as const,
      checks: {
        database: true,
        migrations: true,
      },
      details: {
        databaseDriver: "pglite",
        databaseMode: "embedded",
        databaseLocation: "/Users/example/private/db",
      },
    };
  }

  async migrationStatus() {
    return {
      pending: [],
      executed: [],
    };
  }

  async migrate() {
    return {
      executed: [],
    };
  }
}

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_resource_diagnostic_summary_test",
    entrypoint: "system",
  });
}

function resourceSummary(overrides?: Partial<ResourceSummary>): ResourceSummary {
  return {
    id: "res_web",
    projectId: "prj_demo",
    environmentId: "env_demo",
    destinationId: "dst_demo",
    name: "Web",
    slug: "web",
    kind: "application",
    services: [
      {
        name: "web",
        kind: "web",
      },
    ],
    networkProfile: {
      internalPort: 3000,
      upstreamProtocol: "http",
      exposureMode: "reverse-proxy",
      targetServiceName: "web",
    },
    deploymentCount: 1,
    lastDeploymentId: "dep_web",
    lastDeploymentStatus: "succeeded",
    accessSummary: {
      latestGeneratedAccessRoute: {
        url: "http://web.203.0.113.10.sslip.io",
        hostname: "web.203.0.113.10.sslip.io",
        scheme: "http",
        providerKey: "sslip",
        deploymentId: "dep_web",
        deploymentStatus: "succeeded",
        pathPrefix: "/",
        proxyKind: "traefik",
        targetPort: 3000,
        updatedAt: "2026-01-01T00:00:05.000Z",
      },
      proxyRouteStatus: "ready",
      lastRouteRealizationDeploymentId: "dep_web",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function deploymentSummary(overrides?: Partial<DeploymentSummary>): DeploymentSummary {
  return {
    id: "dep_web",
    projectId: "prj_demo",
    environmentId: "env_demo",
    resourceId: "res_web",
    serverId: "srv_demo",
    destinationId: "dst_demo",
    status: "succeeded",
    runtimePlan: {
      id: "rplan_demo",
      source: {
        kind: "local-folder",
        locator: ".",
        displayName: "workspace",
      },
      buildStrategy: "workspace-commands",
      packagingMode: "host-process-runtime",
      execution: {
        kind: "host-process",
        port: 3000,
        accessRoutes: [
          {
            proxyKind: "traefik",
            domains: ["web.203.0.113.10.sslip.io"],
            pathPrefix: "/",
            tlsMode: "disabled",
            targetPort: 3000,
          },
        ],
      },
      target: {
        kind: "single-server",
        providerKey: "local-shell",
        serverIds: ["srv_demo"],
      },
      detectSummary: "detected workspace",
      generatedAt: "2026-01-01T00:00:00.000Z",
      steps: ["start process"],
    },
    environmentSnapshot: {
      id: "snap_demo",
      environmentId: "env_demo",
      createdAt: "2026-01-01T00:00:00.000Z",
      precedence: ["defaults", "environment", "deployment"],
      variables: [
        {
          key: "TOKEN",
          value: "secret-token",
          kind: "secret",
          exposure: "runtime",
          scope: "environment",
          isSecret: true,
        },
      ],
    },
    logs: [
      {
        timestamp: "2026-01-01T00:00:03.000Z",
        source: "application",
        phase: "deploy",
        level: "error",
        message: "runtime printed secret-token",
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    startedAt: "2026-01-01T00:00:01.000Z",
    finishedAt: "2026-01-01T00:00:04.000Z",
    logCount: 1,
    ...overrides,
  };
}

function runtimeLogLine(message: string): ResourceRuntimeLogEvent {
  return {
    kind: "line",
    line: {
      resourceId: "res_web",
      deploymentId: "dep_web",
      serviceName: "web",
      runtimeKind: "host-process",
      stream: "stdout",
      timestamp: "2026-01-01T00:00:06.000Z",
      sequence: 1,
      message,
      masked: false,
    },
  };
}

function createService(input?: {
  resources?: ResourceSummary[];
  deployments?: DeploymentSummary[];
  deploymentLogs?: DeploymentLogSummary[];
  runtimeLogEvents?: ResourceRuntimeLogEvent[];
  edgeProxyProviderRegistry?: EdgeProxyProviderRegistry;
}) {
  const resourceReadModel = new StaticResourceReadModel(input?.resources ?? [resourceSummary()]);
  const deploymentReadModel = new StaticDeploymentReadModel(
    input?.deployments ?? [deploymentSummary()],
    input?.deploymentLogs ?? deploymentSummary().logs,
  );
  const listResourcesQueryService = new ListResourcesQueryService(
    resourceReadModel,
    new EmptyDestinationRepository(),
    new EmptyServerRepository(),
    new DisabledDefaultAccessDomainProvider(),
  );
  const runtimeLogReader = new RecordingRuntimeLogReader(
    new StaticRuntimeLogStream(
      input?.runtimeLogEvents ?? [
        runtimeLogLine("booted with secret-token"),
        {
          kind: "closed",
          reason: "source-ended",
        },
      ],
    ),
  );
  const runtimeLogsQueryService = new ResourceRuntimeLogsQueryService(
    resourceReadModel,
    deploymentReadModel,
    runtimeLogReader,
  );
  const proxyConfigurationQueryService = new ResourceProxyConfigurationPreviewQueryService(
    listResourcesQueryService,
    deploymentReadModel,
    input?.edgeProxyProviderRegistry ?? new MissingEdgeProxyProviderRegistry(),
    new FixedClock(),
  );
  const service = new ResourceDiagnosticSummaryQueryService(
    listResourcesQueryService,
    deploymentReadModel,
    runtimeLogsQueryService,
    proxyConfigurationQueryService,
    new StaticDiagnosticsPort(),
    new FixedClock(),
  );

  return {
    runtimeLogReader,
    service,
  };
}

describe("ResourceDiagnosticSummaryQueryService", () => {
  test("returns a copyable redacted summary with stable resource and deployment ids", async () => {
    const context = createTestContext();
    const { service } = createService();
    const query = ResourceDiagnosticSummaryQuery.create({
      resourceId: "res_web",
      includeDeploymentLogTail: true,
      includeRuntimeLogTail: true,
      includeProxyConfiguration: false,
      tailLines: 20,
    })._unsafeUnwrap();

    const result = await service.execute(context, query);

    expect(result.isOk()).toBe(true);
    const summary = result._unsafeUnwrap();
    expect(summary.focus).toMatchObject({
      resourceId: "res_web",
      deploymentId: "dep_web",
    });
    expect(summary.access.status).toBe("available");
    expect(summary.proxy.providerKey).toBe("traefik");
    expect(summary.deploymentLogs.lines[0]?.message).toContain("********");
    expect(summary.runtimeLogs.lines[0]?.message).toContain("********");
    expect(summary.copy.json).toContain('"resourceId": "res_web"');
    expect(summary.copy.json).toContain('"deploymentId": "dep_web"');
    expect(summary.copy.json).not.toContain("secret-token");
    expect(summary.system.databaseDriver).toBe("pglite");
    expect(summary.copy.json).not.toContain("databaseLocation");
  });

  test("[EDGE-PROXY-ROUTE-005] includes server-applied route access in diagnostics", async () => {
    const context = createTestContext();
    const { service } = createService({
      resources: [
        resourceSummary({
          accessSummary: {
            latestServerAppliedDomainRoute: {
              url: "https://www.example.test/admin",
              hostname: "www.example.test",
              scheme: "https",
              deploymentId: "dep_web",
              deploymentStatus: "succeeded",
              pathPrefix: "/admin",
              proxyKind: "traefik",
              targetPort: 3000,
              updatedAt: "2026-01-01T00:00:05.000Z",
            },
            proxyRouteStatus: "ready",
            lastRouteRealizationDeploymentId: "dep_web",
          },
        }),
      ],
    });
    const query = ResourceDiagnosticSummaryQuery.create({
      resourceId: "res_web",
      includeDeploymentLogTail: false,
      includeRuntimeLogTail: false,
      includeProxyConfiguration: false,
      tailLines: 10,
    })._unsafeUnwrap();

    const result = await service.execute(context, query);

    expect(result.isOk()).toBe(true);
    const summary = result._unsafeUnwrap();
    expect(summary.access).toMatchObject({
      status: "available",
      serverAppliedUrl: "https://www.example.test/admin",
      proxyRouteStatus: "ready",
      lastRouteRealizationDeploymentId: "dep_web",
    });
    expect(summary.proxy).toMatchObject({
      status: "available",
      providerKey: "traefik",
      proxyRouteStatus: "ready",
    });
    expect(summary.copy.json).toContain('"serverAppliedUrl": "https://www.example.test/admin"');
  });

  test("[RES-DIAG-QRY-015] keeps durable route first for diagnostic proxy context", async () => {
    const context = createTestContext();
    const { service } = createService({
      resources: [
        resourceSummary({
          accessSummary: {
            latestDurableDomainRoute: {
              url: "https://durable.example.test",
              hostname: "durable.example.test",
              scheme: "https",
              deploymentId: "dep_web",
              deploymentStatus: "succeeded",
              pathPrefix: "/",
              proxyKind: "caddy",
              targetPort: 3000,
              updatedAt: "2026-01-01T00:00:07.000Z",
            },
            latestServerAppliedDomainRoute: {
              url: "https://server-applied.example.test",
              hostname: "server-applied.example.test",
              scheme: "https",
              deploymentId: "dep_web",
              deploymentStatus: "succeeded",
              pathPrefix: "/",
              proxyKind: "traefik",
              targetPort: 3000,
              updatedAt: "2026-01-01T00:00:06.000Z",
            },
            latestGeneratedAccessRoute: {
              url: "http://generated.example.test",
              hostname: "generated.example.test",
              scheme: "http",
              providerKey: "sslip",
              deploymentId: "dep_web",
              deploymentStatus: "succeeded",
              pathPrefix: "/",
              proxyKind: "traefik",
              targetPort: 3000,
              updatedAt: "2026-01-01T00:00:05.000Z",
            },
            proxyRouteStatus: "ready",
            lastRouteRealizationDeploymentId: "dep_web",
          },
        }),
      ],
    });
    const query = ResourceDiagnosticSummaryQuery.create({
      resourceId: "res_web",
      includeDeploymentLogTail: false,
      includeRuntimeLogTail: false,
      includeProxyConfiguration: false,
      tailLines: 10,
    })._unsafeUnwrap();

    const result = await service.execute(context, query);

    expect(result.isOk()).toBe(true);
    const summary = result._unsafeUnwrap();
    expect(summary.access).toMatchObject({
      durableUrl: "https://durable.example.test",
      serverAppliedUrl: "https://server-applied.example.test",
      generatedUrl: "http://generated.example.test",
    });
    expect(summary.proxy.providerKey).toBe("caddy");
    expect(summary.copy.json).toContain('"durableUrl": "https://durable.example.test"');
  });

  test("[EDGE-PROXY-ROUTE-006] includes provider-local TLS diagnostics in resource diagnostics", async () => {
    const context = createTestContext();
    const { service } = createService({
      resources: [
        resourceSummary({
          accessSummary: {
            latestServerAppliedDomainRoute: {
              url: "https://www.example.test",
              hostname: "www.example.test",
              scheme: "https",
              deploymentId: "dep_web",
              deploymentStatus: "succeeded",
              pathPrefix: "/",
              proxyKind: "traefik",
              targetPort: 3000,
              updatedAt: "2026-01-01T00:00:05.000Z",
            },
            proxyRouteStatus: "ready",
            lastRouteRealizationDeploymentId: "dep_web",
          },
        }),
      ],
      deployments: [
        deploymentSummary({
          runtimePlan: {
            ...deploymentSummary().runtimePlan,
            execution: {
              kind: "host-process",
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
          },
        }),
      ],
      edgeProxyProviderRegistry: new StaticEdgeProxyProviderRegistry(
        new TlsDiagnosticEdgeProxyProvider(),
      ),
    });
    const query = ResourceDiagnosticSummaryQuery.create({
      resourceId: "res_web",
      includeDeploymentLogTail: false,
      includeRuntimeLogTail: false,
      includeProxyConfiguration: true,
      tailLines: 10,
    })._unsafeUnwrap();

    const result = await service.execute(context, query);

    expect(result.isOk()).toBe(true);
    const summary = result._unsafeUnwrap();
    expect(summary.proxy.tlsRoutes).toEqual([
      expect.objectContaining({
        hostname: "www.example.test",
        tlsMode: "auto",
        automation: "provider-local",
        certificateSource: "provider-local",
        appaloftCertificateManaged: false,
      }),
    ]);
    expect(summary.copy.json).toContain('"automation": "provider-local"');
    expect(summary.copy.json).toContain('"appaloftCertificateManaged": false');
  });

  test("keeps missing access and unrequested runtime logs as section state", async () => {
    const context = createTestContext();
    const resourceWithoutAccess = resourceSummary();
    delete resourceWithoutAccess.accessSummary;
    const { runtimeLogReader, service } = createService({
      resources: [resourceWithoutAccess],
    });
    const query = ResourceDiagnosticSummaryQuery.create({
      resourceId: "res_web",
      includeDeploymentLogTail: true,
      includeRuntimeLogTail: false,
      tailLines: 10,
    })._unsafeUnwrap();

    const result = await service.execute(context, query);

    expect(result.isOk()).toBe(true);
    const summary = result._unsafeUnwrap();
    expect(summary.access.status).toBe("unavailable");
    expect(summary.runtimeLogs.status).toBe("not-requested");
    expect(runtimeLogReader.calls).toHaveLength(0);
    expect(summary.sourceErrors).toContainEqual(
      expect.objectContaining({
        source: "access",
        code: "default_access_route_unavailable",
        phase: "access-summary",
      }),
    );
  });

  test("keeps proxy and runtime source failures inside copyable diagnostics", async () => {
    const context = createTestContext();
    const { service } = createService({
      runtimeLogEvents: [
        {
          kind: "error",
          error: domainError.resourceRuntimeLogsUnavailable(
            "Runtime log process exited with code 1",
            {
              phase: "process-exit",
              resourceId: "res_web",
              deploymentId: "dep_web",
            },
          ),
        },
      ],
      edgeProxyProviderRegistry: new UnregisteredEdgeProxyProviderRegistry(),
    });
    const query = ResourceDiagnosticSummaryQuery.create({
      resourceId: "res_web",
      includeDeploymentLogTail: true,
      includeRuntimeLogTail: true,
      includeProxyConfiguration: true,
      tailLines: 20,
    })._unsafeUnwrap();

    const result = await service.execute(context, query);

    expect(result.isOk()).toBe(true);
    const summary = result._unsafeUnwrap();
    expect(summary.proxy.status).toBe("unavailable");
    expect(summary.runtimeLogs.status).toBe("failed");
    expect(summary.sourceErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "proxy",
          code: "proxy_provider_unavailable",
          message: "Edge proxy provider is not registered",
        }),
        expect.objectContaining({
          source: "runtime-logs",
          code: "resource_runtime_logs_unavailable",
          message: "Runtime log process exited with code 1",
        }),
      ]),
    );
    expect(summary.copy.json).toContain("Edge proxy provider is not registered");
    expect(summary.copy.json).toContain("Runtime log process exited with code 1");
  });

  test("rejects a selected deployment that belongs to another resource", async () => {
    const context = createTestContext();
    const { service } = createService({
      deployments: [
        deploymentSummary({
          id: "dep_other",
          resourceId: "res_other",
        }),
      ],
    });
    const query = ResourceDiagnosticSummaryQuery.create({
      resourceId: "res_web",
      deploymentId: "dep_other",
    })._unsafeUnwrap();

    const result = await service.execute(context, query);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("resource_diagnostic_context_mismatch");
  });
});
