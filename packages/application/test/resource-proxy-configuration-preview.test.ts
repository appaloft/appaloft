import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { domainError, err, ok, type Result } from "@yundu/core";

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
      networkName: "yundu-edge",
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
    return ok({
      resourceId: input.resourceId,
      ...(input.deploymentId ? { deploymentId: input.deploymentId } : {}),
      providerKey: this.key,
      routeScope: input.routeScope,
      status: input.status,
      generatedAt: input.generatedAt,
      stale: input.stale,
      routes: [],
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

function resourceSummary(): ResourceSummary {
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
  test("renders latest provider configuration from deployment route snapshot", async () => {
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
});
