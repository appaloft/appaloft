import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { domainError, err, ok, type Result } from "@appaloft/core";

import { createExecutionContext, type ExecutionContext, type toRepositoryContext } from "../src";
import { ResourceProxyConfigurationPreviewQuery } from "../src/messages";
import {
  type DefaultAccessDomainProvider,
  type DeploymentReadModel,
  type DeploymentSummary,
  type DestinationRepository,
  type EdgeProxyEnsureInput,
  type EdgeProxyEnsurePlan,
  type EdgeProxyExecutionContext,
  type EdgeProxyProvider,
  type EdgeProxyProviderRegistry,
  type EdgeProxyProviderSelectionInput,
  type ProxyConfigurationRouteView,
  type ProxyConfigurationView,
  type ProxyConfigurationViewInput,
  type ProxyReloadInput,
  type ProxyReloadPlan,
  type ProxyRouteRealizationInput,
  type ProxyRouteRealizationPlan,
  type ResourceReadModel,
  type ResourceSummary,
  type ServerRepository,
} from "../src/ports";
import {
  ListResourcesQueryService,
  ResourceProxyConfigurationPreviewQueryService,
} from "../src/use-cases";

class FixedClock {
  now(): string {
    return "2026-01-01T00:00:00.000Z";
  }
}

class StaticResourceReadModel implements ResourceReadModel {
  constructor(private readonly resources: ResourceSummary[]) {}

  async list(): Promise<ResourceSummary[]> {
    return this.resources;
  }

  async findOne(): Promise<ResourceSummary | null> {
    return null;
  }
}

class StaticDeploymentReadModel implements DeploymentReadModel {
  constructor(private readonly deployments: DeploymentSummary[]) {}

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

  async findLogs(): Promise<[]> {
    return [];
  }

  async findOne(): Promise<DeploymentSummary | null> {
    return null;
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

class FakeEdgeProxyProvider implements EdgeProxyProvider {
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

  lastConfigurationInput: ProxyConfigurationViewInput | null = null;

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
    this.lastConfigurationInput = input;
    const routes: ProxyConfigurationRouteView[] = input.accessRoutes.flatMap((route) =>
      route.domains.map((hostname) => {
        const redirect = route as typeof route & {
          routeBehavior?: "serve" | "redirect";
          redirectTo?: string;
          redirectStatus?: 301 | 302 | 307 | 308;
        };
        const scheme = route.tlsMode === "auto" ? "https" : "http";
        return {
          hostname,
          scheme,
          url: `${scheme}://${hostname}`,
          pathPrefix: route.pathPrefix,
          tlsMode: route.tlsMode,
          ...(route.targetPort === undefined ? {} : { targetPort: route.targetPort }),
          source:
            route.source ??
            (input.routeScope === "planned" ? "generated-default" : "deployment-snapshot"),
          ...(redirect.routeBehavior ? { routeBehavior: redirect.routeBehavior } : {}),
          ...(redirect.redirectTo ? { redirectTo: redirect.redirectTo } : {}),
          ...(redirect.redirectStatus ? { redirectStatus: redirect.redirectStatus } : {}),
        };
      }),
    );

    return ok({
      resourceId: input.resourceId,
      ...(input.deploymentId ? { deploymentId: input.deploymentId } : {}),
      providerKey: this.key,
      routeScope: input.routeScope,
      status: input.status,
      generatedAt: input.generatedAt,
      stale: input.stale,
      routes,
      sections: [
        {
          id: "labels",
          title: "Labels",
          format: "docker-labels",
          readonly: true,
          redacted: false,
          content: "traefik.enable=true",
          source: "provider-rendered",
        },
      ],
      warnings: [],
    });
  }
}

class StaticEdgeProxyProviderRegistry implements EdgeProxyProviderRegistry {
  constructor(private readonly provider: EdgeProxyProvider | null) {}

  resolve(key: string): Result<EdgeProxyProvider> {
    return this.provider && this.provider.key === key
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

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_proxy_configuration_preview_test",
    entrypoint: "system",
  });
}

function resourceSummary(overrides?: Partial<ResourceSummary>): ResourceSummary {
  return {
    id: "res_web",
    projectId: "prj_demo",
    environmentId: "env_demo",
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
    },
    deploymentCount: 1,
    lastDeploymentId: "dep_web",
    lastDeploymentStatus: "succeeded",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function deploymentSummary(): DeploymentSummary {
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
        kind: "git-public",
        locator: "https://github.com/acme/web.git",
        displayName: "acme/web",
      },
      buildStrategy: "dockerfile",
      packagingMode: "all-in-one-docker",
      execution: {
        kind: "docker-container",
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
        providerKey: "generic-ssh",
        serverIds: ["srv_demo"],
      },
      detectSummary: "detected Dockerfile",
      generatedAt: "2026-01-01T00:00:00.000Z",
      steps: ["build", "run"],
    },
    environmentSnapshot: {
      id: "snap_demo",
      environmentId: "env_demo",
      createdAt: "2026-01-01T00:00:00.000Z",
      precedence: ["defaults", "environment", "deployment"],
      variables: [],
    },
    logs: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    startedAt: "2026-01-01T00:00:01.000Z",
    finishedAt: "2026-01-01T00:00:02.000Z",
    logCount: 0,
  };
}

function createService(provider = new FakeEdgeProxyProvider()) {
  const resourceReadModel = new StaticResourceReadModel([resourceSummary()]);
  const listResourcesQueryService = new ListResourcesQueryService(
    resourceReadModel,
    new EmptyDestinationRepository(),
    new EmptyServerRepository(),
    new DisabledDefaultAccessDomainProvider(),
  );
  const service = new ResourceProxyConfigurationPreviewQueryService(
    listResourcesQueryService,
    new StaticDeploymentReadModel([deploymentSummary()]),
    new StaticEdgeProxyProviderRegistry(provider),
    new FixedClock(),
  );

  return {
    provider,
    service,
  };
}

describe("ResourceProxyConfigurationPreviewQueryService", () => {
  test("[PROXY-OBS-002][PROXY-OBS-003] renders latest provider configuration from deployment route snapshot", async () => {
    const context = createTestContext();
    const { provider, service } = createService();
    const query = ResourceProxyConfigurationPreviewQuery.create({
      resourceId: "res_web",
      routeScope: "latest",
      includeDiagnostics: true,
    })._unsafeUnwrap();

    const result = await service.execute(context, query);

    expect(result.isOk()).toBe(true);
    const output = result._unsafeUnwrap();
    expect(output).toMatchObject({
      resourceId: "res_web",
      deploymentId: "dep_web",
      providerKey: "traefik",
      routeScope: "latest",
      status: "applied",
    });
    expect(output.sections[0]?.content).toContain("traefik.enable=true");
    expect(provider.lastConfigurationInput).toMatchObject({
      resourceId: "res_web",
      deploymentId: "dep_web",
      port: 3000,
      includeDiagnostics: true,
    });
  });

  test("[DEF-ACCESS-QRY-002][EDGE-PROXY-QRY-002][PROXY-OBS-001] renders durable route before server-applied and generated routes", async () => {
    const context = createTestContext();
    const provider = new FakeEdgeProxyProvider();
    const deployment = deploymentSummary();
    const durableDeployment: DeploymentSummary = {
      ...deployment,
      id: "dep_durable",
      runtimePlan: {
        ...deployment.runtimePlan,
        execution: {
          ...deployment.runtimePlan.execution,
          accessRoutes: [
            {
              proxyKind: "traefik",
              domains: ["durable.example.test"],
              pathPrefix: "/",
              tlsMode: "disabled",
              targetPort: 3000,
            },
          ],
          metadata: {
            "access.routeSource": "durable-domain-binding",
          },
        },
      },
    };
    const service = new ResourceProxyConfigurationPreviewQueryService(
      new ListResourcesQueryService(
        new StaticResourceReadModel([
          resourceSummary({
            accessSummary: {
              latestDurableDomainRoute: {
                url: "http://durable.example.test",
                hostname: "durable.example.test",
                scheme: "http",
                deploymentId: "dep_durable",
                deploymentStatus: "succeeded",
                pathPrefix: "/",
                proxyKind: "traefik",
                targetPort: 3000,
                updatedAt: "2026-01-01T00:00:03.000Z",
              },
              latestServerAppliedDomainRoute: {
                url: "http://server-applied.example.test",
                hostname: "server-applied.example.test",
                scheme: "http",
                deploymentId: "dep_server_applied",
                deploymentStatus: "succeeded",
                pathPrefix: "/",
                proxyKind: "traefik",
                targetPort: 3000,
                updatedAt: "2026-01-01T00:00:02.000Z",
              },
              latestGeneratedAccessRoute: {
                url: "http://generated.example.test",
                hostname: "generated.example.test",
                scheme: "http",
                providerKey: "sslip",
                deploymentId: "dep_generated",
                deploymentStatus: "succeeded",
                pathPrefix: "/",
                proxyKind: "traefik",
                targetPort: 3000,
                updatedAt: "2026-01-01T00:00:01.000Z",
              },
              proxyRouteStatus: "ready",
              lastRouteRealizationDeploymentId: "dep_durable",
            },
          }),
        ]),
        new EmptyDestinationRepository(),
        new EmptyServerRepository(),
        new DisabledDefaultAccessDomainProvider(),
      ),
      new StaticDeploymentReadModel([durableDeployment]),
      new StaticEdgeProxyProviderRegistry(provider),
      new FixedClock(),
    );
    const query = ResourceProxyConfigurationPreviewQuery.create({
      resourceId: "res_web",
      routeScope: "latest",
    })._unsafeUnwrap();

    const result = await service.execute(context, query);

    expect(result.isOk()).toBe(true);
    expect(provider.lastConfigurationInput?.accessRoutes).toEqual([
      expect.objectContaining({
        domains: ["durable.example.test"],
        source: "domain-binding",
      }),
    ]);
    expect(result._unsafeUnwrap().routes).toEqual([
      expect.objectContaining({
        hostname: "durable.example.test",
        source: "domain-binding",
      }),
    ]);
  });

  test("[DEF-ACCESS-ROUTE-013][EDGE-PROXY-QRY-002][PROXY-OBS-001] renders server-applied route before generated route", async () => {
    const context = createTestContext();
    const provider = new FakeEdgeProxyProvider();
    const deployment = deploymentSummary();
    const serverAppliedDeployment: DeploymentSummary = {
      ...deployment,
      id: "dep_server_applied",
      runtimePlan: {
        ...deployment.runtimePlan,
        execution: {
          ...deployment.runtimePlan.execution,
          accessRoutes: [
            {
              proxyKind: "traefik",
              domains: ["server-applied.example.test"],
              pathPrefix: "/",
              tlsMode: "disabled",
              targetPort: 3000,
            },
          ],
          metadata: {
            "access.routeSource": "server-applied-config-domain",
          },
        },
      },
    };
    const service = new ResourceProxyConfigurationPreviewQueryService(
      new ListResourcesQueryService(
        new StaticResourceReadModel([
          resourceSummary({
            accessSummary: {
              latestServerAppliedDomainRoute: {
                url: "http://server-applied.example.test",
                hostname: "server-applied.example.test",
                scheme: "http",
                deploymentId: "dep_server_applied",
                deploymentStatus: "succeeded",
                pathPrefix: "/",
                proxyKind: "traefik",
                targetPort: 3000,
                updatedAt: "2026-01-01T00:00:02.000Z",
              },
              latestGeneratedAccessRoute: {
                url: "http://generated.example.test",
                hostname: "generated.example.test",
                scheme: "http",
                providerKey: "sslip",
                deploymentId: "dep_generated",
                deploymentStatus: "succeeded",
                pathPrefix: "/",
                proxyKind: "traefik",
                targetPort: 3000,
                updatedAt: "2026-01-01T00:00:01.000Z",
              },
              proxyRouteStatus: "ready",
              lastRouteRealizationDeploymentId: "dep_server_applied",
            },
          }),
        ]),
        new EmptyDestinationRepository(),
        new EmptyServerRepository(),
        new DisabledDefaultAccessDomainProvider(),
      ),
      new StaticDeploymentReadModel([serverAppliedDeployment]),
      new StaticEdgeProxyProviderRegistry(provider),
      new FixedClock(),
    );
    const query = ResourceProxyConfigurationPreviewQuery.create({
      resourceId: "res_web",
      routeScope: "latest",
    })._unsafeUnwrap();

    const result = await service.execute(context, query);

    expect(result.isOk()).toBe(true);
    expect(provider.lastConfigurationInput?.accessRoutes).toEqual([
      expect.objectContaining({
        domains: ["server-applied.example.test"],
        source: "server-applied",
      }),
    ]);
    expect(result._unsafeUnwrap().routes).toEqual([
      expect.objectContaining({
        hostname: "server-applied.example.test",
        source: "server-applied",
      }),
    ]);
  });

  test("does not treat generated access domain provider as edge proxy provider", async () => {
    const context = createTestContext();
    const resourceReadModel = new StaticResourceReadModel([
      {
        ...resourceSummary(),
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
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          proxyRouteStatus: "ready",
          lastRouteRealizationDeploymentId: "dep_web",
        },
      },
    ]);
    const listResourcesQueryService = new ListResourcesQueryService(
      resourceReadModel,
      new EmptyDestinationRepository(),
      new EmptyServerRepository(),
      new DisabledDefaultAccessDomainProvider(),
    );
    const deployment = deploymentSummary();
    const service = new ResourceProxyConfigurationPreviewQueryService(
      listResourcesQueryService,
      new StaticDeploymentReadModel([
        {
          ...deployment,
          runtimePlan: {
            ...deployment.runtimePlan,
            execution: {
              ...deployment.runtimePlan.execution,
              metadata: {
                "access.providerKey": "sslip",
                "access.routeSource": "generated-default",
              },
            },
          },
        },
      ]),
      new StaticEdgeProxyProviderRegistry(new FakeEdgeProxyProvider()),
      new FixedClock(),
    );
    const query = ResourceProxyConfigurationPreviewQuery.create({
      resourceId: "res_web",
      routeScope: "latest",
    })._unsafeUnwrap();

    const result = await service.execute(context, query);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      providerKey: "traefik",
      status: "applied",
    });
  });

  test("returns not-configured when the resource has no proxy route", async () => {
    const context = createTestContext();
    const listResourcesQueryService = new ListResourcesQueryService(
      new StaticResourceReadModel([resourceSummary()]),
      new EmptyDestinationRepository(),
      new EmptyServerRepository(),
      new DisabledDefaultAccessDomainProvider(),
    );
    const service = new ResourceProxyConfigurationPreviewQueryService(
      listResourcesQueryService,
      new StaticDeploymentReadModel([
        {
          ...deploymentSummary(),
          runtimePlan: {
            ...deploymentSummary().runtimePlan,
            execution: {
              kind: "docker-container",
              port: 3000,
            },
          },
        },
      ]),
      new StaticEdgeProxyProviderRegistry(new FakeEdgeProxyProvider()),
      new FixedClock(),
    );
    const query = ResourceProxyConfigurationPreviewQuery.create({
      resourceId: "res_web",
    })._unsafeUnwrap();

    const result = await service.execute(context, query);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      resourceId: "res_web",
      providerKey: "none",
      status: "not-configured",
      sections: [],
    });
  });

  test("[EDGE-PROXY-QRY-007] preserves canonical redirect metadata in proxy configuration queries", async () => {
    type RedirectAccessRoute = NonNullable<
      DeploymentSummary["runtimePlan"]["execution"]["accessRoutes"]
    >[number] & {
      routeBehavior?: "serve" | "redirect";
      redirectTo?: string;
      redirectStatus?: 301 | 302 | 307 | 308;
    };

    const context = createTestContext();
    const deployment = deploymentSummary();
    const accessRoutes: RedirectAccessRoute[] = [
      {
        proxyKind: "traefik",
        domains: ["example.test"],
        pathPrefix: "/",
        tlsMode: "auto",
        targetPort: 3000,
      },
      {
        proxyKind: "traefik",
        domains: ["www.example.test"],
        pathPrefix: "/",
        tlsMode: "auto",
        routeBehavior: "redirect",
        redirectTo: "example.test",
        redirectStatus: 308,
      },
    ];
    const service = new ResourceProxyConfigurationPreviewQueryService(
      new ListResourcesQueryService(
        new StaticResourceReadModel([resourceSummary()]),
        new EmptyDestinationRepository(),
        new EmptyServerRepository(),
        new DisabledDefaultAccessDomainProvider(),
      ),
      new StaticDeploymentReadModel([
        {
          ...deployment,
          runtimePlan: {
            ...deployment.runtimePlan,
            execution: {
              ...deployment.runtimePlan.execution,
              accessRoutes,
            },
          },
        },
      ]),
      new StaticEdgeProxyProviderRegistry(new FakeEdgeProxyProvider()),
      new FixedClock(),
    );
    const query = ResourceProxyConfigurationPreviewQuery.create({
      resourceId: "res_web",
      routeScope: "latest",
    })._unsafeUnwrap();

    const result = await service.execute(context, query);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().routes).toEqual(
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
