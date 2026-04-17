import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok } from "@appaloft/core";

import { createExecutionContext, type ExecutionContext, type toRepositoryContext } from "../src";
import { ResourceHealthQuery } from "../src/messages";
import {
  type DefaultAccessDomainProvider,
  type DeploymentLogSummary,
  type DeploymentReadModel,
  type DeploymentSummary,
  type DestinationRepository,
  type ResourceReadModel,
  type ResourceSummary,
  type ServerRepository,
} from "../src/ports";
import { ListResourcesQueryService, ResourceHealthQueryService } from "../src/use-cases";

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

  async findLogs(): Promise<DeploymentLogSummary[]> {
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

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_resource_health_test",
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
      variables: [],
    },
    logs: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    startedAt: "2026-01-01T00:00:01.000Z",
    finishedAt: "2026-01-01T00:00:04.000Z",
    logCount: 0,
    ...overrides,
  };
}

function createService(input?: {
  resources?: ResourceSummary[];
  deployments?: DeploymentSummary[];
}) {
  const resourceReadModel = new StaticResourceReadModel(input?.resources ?? [resourceSummary()]);
  const deploymentReadModel = new StaticDeploymentReadModel(
    input?.deployments ?? [deploymentSummary()],
  );
  const listResourcesQueryService = new ListResourcesQueryService(
    resourceReadModel,
    new EmptyDestinationRepository(),
    new EmptyServerRepository(),
    new DisabledDefaultAccessDomainProvider(),
  );

  return new ResourceHealthQueryService(
    listResourcesQueryService,
    deploymentReadModel,
    new FixedClock(),
  );
}

function createQuery(input?: Partial<Parameters<typeof ResourceHealthQuery.create>[0]>) {
  return ResourceHealthQuery.create({
    resourceId: "res_web",
    ...input,
  })._unsafeUnwrap();
}

describe("ResourceHealthQueryService", () => {
  test("reports not-deployed when no latest deployment exists", async () => {
    const resource = resourceSummary({
      deploymentCount: 0,
    });
    delete resource.lastDeploymentId;
    delete resource.lastDeploymentStatus;
    const service = createService({
      resources: [resource],
      deployments: [],
    });

    const result = await service.execute(createTestContext(), createQuery());

    expect(result.isOk()).toBe(true);
    const summary = result._unsafeUnwrap();
    expect(summary.overall).toBe("not-deployed");
    expect(summary.runtime.lifecycle).toBe("not-deployed");
    expect(summary.latestDeployment).toBeUndefined();
    expect(summary.sourceErrors).toContainEqual(
      expect.objectContaining({
        source: "deployment",
        code: "resource_latest_deployment_unavailable",
      }),
    );
  });

  test("does not treat a successful deployment as healthy without health observations", async () => {
    const service = createService();

    const result = await service.execute(createTestContext(), createQuery());

    expect(result.isOk()).toBe(true);
    const summary = result._unsafeUnwrap();
    expect(summary.latestDeployment?.status).toBe("succeeded");
    expect(summary.publicAccess.status).toBe("ready");
    expect(summary.proxy.status).toBe("ready");
    expect(summary.healthPolicy.status).toBe("not-configured");
    expect(summary.overall).toBe("unknown");
    expect(summary.sourceErrors).toContainEqual(
      expect.objectContaining({
        source: "health-policy",
        code: "resource_health_policy_not_configured",
      }),
    );
  });

  test("degrades current health when public access or proxy route state failed", async () => {
    const service = createService({
      resources: [
        resourceSummary({
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
            proxyRouteStatus: "failed",
            lastRouteRealizationDeploymentId: "dep_web",
          },
        }),
      ],
    });

    const result = await service.execute(createTestContext(), createQuery());

    expect(result.isOk()).toBe(true);
    const summary = result._unsafeUnwrap();
    expect(summary.overall).toBe("degraded");
    expect(summary.publicAccess.status).toBe("failed");
    expect(summary.proxy.status).toBe("failed");
    expect(summary.sourceErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "public-access",
          code: "resource_public_access_probe_failed",
        }),
        expect.objectContaining({
          source: "proxy",
          code: "resource_proxy_route_unavailable",
        }),
      ]),
    );
  });

  test("reports starting while the latest deployment is still in flight", async () => {
    const deployment = deploymentSummary({
      status: "running",
    });
    delete deployment.finishedAt;
    const service = createService({
      deployments: [deployment],
    });

    const result = await service.execute(createTestContext(), createQuery());

    expect(result.isOk()).toBe(true);
    const summary = result._unsafeUnwrap();
    expect(summary.overall).toBe("starting");
    expect(summary.runtime.lifecycle).toBe("starting");
    expect(summary.runtime.reasonCode).toBe("deployment_not_terminal");
  });

  test("keeps configured health policy unknown until a current probe is available", async () => {
    const service = createService({
      deployments: [
        deploymentSummary({
          runtimePlan: {
            ...deploymentSummary().runtimePlan,
            execution: {
              ...deploymentSummary().runtimePlan.execution,
              healthCheckPath: "/health",
            },
          },
        }),
      ],
    });

    const result = await service.execute(createTestContext(), createQuery());

    expect(result.isOk()).toBe(true);
    const summary = result._unsafeUnwrap();
    expect(summary.healthPolicy).toMatchObject({
      status: "configured",
      enabled: true,
      type: "http",
      path: "/health",
      expectedStatusCode: 200,
    });
    expect(summary.overall).toBe("unknown");
    expect(summary.checks).toContainEqual(
      expect.objectContaining({
        name: "health-policy",
        status: "unknown",
        reasonCode: "cached_policy_not_executed",
      }),
    );
  });
});
