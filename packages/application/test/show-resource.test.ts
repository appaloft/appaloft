import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  ArchivedAt,
  CommandText,
  CreatedAt,
  DeletedAt,
  DescriptionText,
  DisplayNameText,
  EnvironmentId,
  GitCommitShaText,
  GitRefText,
  HealthCheckExpectedStatusCode,
  HealthCheckHostText,
  HealthCheckHttpMethodValue,
  HealthCheckIntervalSeconds,
  HealthCheckPathText,
  HealthCheckRetryCount,
  HealthCheckSchemeValue,
  HealthCheckStartPeriodSeconds,
  HealthCheckTimeoutSeconds,
  HealthCheckTypeValue,
  ok,
  PortNumber,
  ProjectId,
  Resource,
  ResourceExposureModeValue,
  ResourceGeneratedAccessModeValue,
  ResourceId,
  ResourceKindValue,
  type ResourceMutationSpec,
  ResourceName,
  ResourceNetworkProtocolValue,
  type ResourceSelectionSpec,
  ResourceServiceKindValue,
  ResourceServiceName,
  ResourceSlug,
  type Result,
  RoutePathPrefix,
  RuntimePlanStrategyValue,
  SourceBaseDirectory,
  SourceKindValue,
  SourceLocator,
} from "@appaloft/core";

import { createExecutionContext, type ExecutionContext, type toRepositoryContext } from "../src";
import { ShowResourceQuery } from "../src/messages";
import {
  type DefaultAccessDomainProvider,
  type DeploymentLogSummary,
  type DeploymentReadModel,
  type DeploymentSummary,
  type DestinationRepository,
  type ResourceDetail,
  type ResourceReadModel,
  type ResourceRepository,
  type ResourceSummary,
  type ServerRepository,
} from "../src/ports";
import { ListResourcesQueryService, ShowResourceQueryService } from "../src/use-cases";

class FixedClock {
  now(): string {
    return "2026-01-01T00:00:10.000Z";
  }
}

class StaticResourceRepository implements ResourceRepository {
  constructor(private readonly resources: Resource[] = []) {}

  async findOne(
    _context: ReturnType<typeof toRepositoryContext>,
    spec: ResourceSelectionSpec,
  ): Promise<Resource | null> {
    return this.resources.find((resource) => spec.isSatisfiedBy(resource)) ?? null;
  }

  async upsert(
    _context: ReturnType<typeof toRepositoryContext>,
    _resource: Resource,
    _spec: ResourceMutationSpec,
  ): Promise<void> {}
}

class StaticResourceReadModel implements ResourceReadModel {
  constructor(private readonly resources: ResourceSummary[]) {}

  async list(
    _context: ReturnType<typeof toRepositoryContext>,
    input?: {
      projectId?: string;
      environmentId?: string;
    },
  ): Promise<ResourceSummary[]> {
    return this.resources
      .filter((resource) => (input?.projectId ? resource.projectId === input.projectId : true))
      .filter((resource) =>
        input?.environmentId ? resource.environmentId === input.environmentId : true,
      );
  }

  async findOne(): Promise<ResourceSummary | null> {
    return null;
  }
}

class StaticDeploymentReadModel implements DeploymentReadModel {
  constructor(private readonly deployments: DeploymentSummary[] = []) {}

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

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_show_resource_test",
    entrypoint: "system",
  });
}

function detailedResource(): Resource {
  return Resource.rehydrate({
    id: ResourceId.rehydrate("res_web"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    name: ResourceName.rehydrate("Web"),
    slug: ResourceSlug.rehydrate("web"),
    kind: ResourceKindValue.rehydrate("application"),
    description: DescriptionText.rehydrate("Deployable web app"),
    services: [
      {
        name: ResourceServiceName.rehydrate("web"),
        kind: ResourceServiceKindValue.rehydrate("web"),
      },
    ],
    sourceBinding: {
      kind: SourceKindValue.rehydrate("git-public"),
      locator: SourceLocator.rehydrate("https://github.com/acme/web.git"),
      displayName: DisplayNameText.rehydrate("acme/web"),
      gitRef: GitRefText.rehydrate("main"),
      commitSha: GitCommitShaText.rehydrate("abcdef1"),
      baseDirectory: SourceBaseDirectory.rehydrate("/apps/web"),
      metadata: {
        branch: "main",
        accessToken: "secret-token",
      },
    },
    runtimeProfile: {
      strategy: RuntimePlanStrategyValue.rehydrate("workspace-commands"),
      installCommand: CommandText.rehydrate("bun install"),
      buildCommand: CommandText.rehydrate("bun run build"),
      startCommand: CommandText.rehydrate("bun run start"),
      healthCheckPath: HealthCheckPathText.rehydrate("/health"),
      healthCheck: {
        enabled: true,
        type: HealthCheckTypeValue.rehydrate("http"),
        intervalSeconds: HealthCheckIntervalSeconds.rehydrate(5),
        timeoutSeconds: HealthCheckTimeoutSeconds.rehydrate(5),
        retries: HealthCheckRetryCount.rehydrate(10),
        startPeriodSeconds: HealthCheckStartPeriodSeconds.rehydrate(5),
        http: {
          method: HealthCheckHttpMethodValue.rehydrate("GET"),
          scheme: HealthCheckSchemeValue.rehydrate("http"),
          host: HealthCheckHostText.rehydrate("localhost"),
          path: HealthCheckPathText.rehydrate("/health"),
          expectedStatusCode: HealthCheckExpectedStatusCode.rehydrate(200),
        },
      },
    },
    networkProfile: {
      internalPort: PortNumber.rehydrate(3000),
      upstreamProtocol: ResourceNetworkProtocolValue.rehydrate("http"),
      exposureMode: ResourceExposureModeValue.rehydrate("reverse-proxy"),
      targetServiceName: ResourceServiceName.rehydrate("web"),
    },
    accessProfile: {
      generatedAccessMode: ResourceGeneratedAccessModeValue.rehydrate("inherit"),
      pathPrefix: RoutePathPrefix.rehydrate("/docs"),
    },
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

function incompleteResource(): Resource {
  return Resource.rehydrate({
    id: ResourceId.rehydrate("res_partial"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    name: ResourceName.rehydrate("Partial"),
    slug: ResourceSlug.rehydrate("partial"),
    kind: ResourceKindValue.rehydrate("application"),
    services: [],
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

function archivedDetailedResource(): Resource {
  const resource = detailedResource();
  resource
    .archive({
      archivedAt: ArchivedAt.rehydrate("2026-01-01T00:00:08.000Z"),
    })
    ._unsafeUnwrap();
  return resource;
}

function deletedDetailedResource(): Resource {
  const resource = archivedDetailedResource();
  resource
    .delete({
      deletedAt: DeletedAt.rehydrate("2026-01-01T00:00:09.000Z"),
    })
    ._unsafeUnwrap();
  return resource;
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
    description: "Deployable web app",
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
    accessProfile: {
      generatedAccessMode: "inherit",
      pathPrefix: "/docs",
    },
    deploymentCount: 1,
    lastDeploymentId: "dep_new",
    lastDeploymentStatus: "succeeded",
    accessSummary: {
      latestGeneratedAccessRoute: {
        url: "http://web.203.0.113.10.sslip.io",
        hostname: "web.203.0.113.10.sslip.io",
        scheme: "http",
        providerKey: "sslip",
        deploymentId: "dep_new",
        deploymentStatus: "succeeded",
        pathPrefix: "/",
        proxyKind: "traefik",
        targetPort: 3000,
        updatedAt: "2026-01-01T00:00:05.000Z",
      },
      proxyRouteStatus: "ready",
      lastRouteRealizationDeploymentId: "dep_new",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function deploymentSummary(overrides?: Partial<DeploymentSummary>): DeploymentSummary {
  return {
    id: "dep_new",
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
    createdAt: "2026-01-01T00:00:05.000Z",
    startedAt: "2026-01-01T00:00:06.000Z",
    finishedAt: "2026-01-01T00:00:09.000Z",
    logCount: 0,
    ...overrides,
  };
}

function createService(input?: {
  resources?: Resource[];
  summaries?: ResourceSummary[];
  deployments?: DeploymentSummary[];
}): ShowResourceQueryService {
  const listResourcesQueryService = new ListResourcesQueryService(
    new StaticResourceReadModel(input?.summaries ?? [resourceSummary()]),
    new EmptyDestinationRepository(),
    new EmptyServerRepository(),
    new DisabledDefaultAccessDomainProvider(),
  );

  return new ShowResourceQueryService(
    new StaticResourceRepository(input?.resources ?? [detailedResource()]),
    listResourcesQueryService,
    new StaticDeploymentReadModel(input?.deployments ?? [deploymentSummary()]),
    new FixedClock(),
  );
}

function createQuery(input?: Partial<Parameters<typeof ShowResourceQuery.create>[0]>) {
  return ShowResourceQuery.create({
    resourceId: "res_web",
    includeLatestDeployment: true,
    includeAccessSummary: true,
    includeProfileDiagnostics: true,
    ...input,
  })._unsafeUnwrap();
}

function unwrap(result: Result<ResourceDetail>): ResourceDetail {
  expect(result.isOk()).toBe(true);
  return result._unsafeUnwrap();
}

describe("ShowResourceQueryService", () => {
  test("[RES-PROFILE-SHOW-001] returns durable resource profile fields", async () => {
    const result = await createService().execute(createTestContext(), createQuery());

    const detail = unwrap(result);
    expect(detail.schemaVersion).toBe("resources.show/v1");
    expect(detail.resource.id).toBe("res_web");
    expect(detail.source).toMatchObject({
      kind: "git-public",
      locator: "https://github.com/acme/web.git",
      gitRef: "main",
      commitSha: "abcdef1",
      baseDirectory: "/apps/web",
      metadata: {
        branch: "main",
        accessToken: "********",
      },
    });
    expect(detail.runtimeProfile).toMatchObject({
      strategy: "workspace-commands",
      installCommand: "bun install",
      buildCommand: "bun run build",
      startCommand: "bun run start",
      healthCheckPath: "/health",
    });
    expect(detail.networkProfile).toEqual({
      internalPort: 3000,
      upstreamProtocol: "http",
      exposureMode: "reverse-proxy",
      targetServiceName: "web",
    });
    expect(detail.accessProfile).toEqual({
      generatedAccessMode: "inherit",
      pathPrefix: "/docs",
    });
    expect(detail.healthPolicy?.http?.path).toBe("/health");
    expect(detail.accessSummary?.latestGeneratedAccessRoute?.url).toContain("sslip.io");
  });

  test("[RES-PROFILE-SHOW-002] returns not_found with resource-read phase for missing resource", async () => {
    const result = await createService({
      resources: [],
      summaries: [],
      deployments: [],
    }).execute(createTestContext(), createQuery());

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "not_found",
      details: {
        queryName: "resources.show",
        phase: "resource-read",
        resourceId: "res_web",
      },
    });
  });

  test("[RES-PROFILE-SHOW-003] returns archived lifecycle state", async () => {
    const result = await createService({
      resources: [archivedDetailedResource()],
    }).execute(createTestContext(), createQuery());

    const detail = unwrap(result);
    expect(detail.lifecycle).toEqual({
      status: "archived",
      archivedAt: "2026-01-01T00:00:08.000Z",
    });
  });

  test("[RES-PROFILE-DELETE-008] hides deleted resources from resources.show", async () => {
    const result = await createService({
      resources: [deletedDetailedResource()],
    }).execute(createTestContext(), createQuery());

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "not_found",
      details: {
        phase: "resource-read",
        resourceId: "res_web",
      },
    });
  });

  test("[RES-PROFILE-SHOW-004] includes latest deployment as contextual data", async () => {
    const result = await createService({
      deployments: [
        deploymentSummary({
          id: "dep_old",
          createdAt: "2026-01-01T00:00:01.000Z",
          status: "failed",
        }),
        deploymentSummary({
          id: "dep_new",
          createdAt: "2026-01-01T00:00:05.000Z",
          status: "succeeded",
        }),
      ],
    }).execute(createTestContext(), createQuery());

    const detail = unwrap(result);
    expect(detail.latestDeployment).toMatchObject({
      id: "dep_new",
      status: "succeeded",
      serverId: "srv_demo",
      destinationId: "dst_demo",
    });
    expect(detail.lifecycle.status).toBe("active");
  });

  test("[RES-PROFILE-SHOW-005] returns safe diagnostics for incomplete profile", async () => {
    const result = await createService({
      resources: [incompleteResource()],
      summaries: [
        resourceSummary({
          id: "res_partial",
          name: "Partial",
          slug: "partial",
          deploymentCount: 0,
        }),
      ],
      deployments: [],
    }).execute(
      createTestContext(),
      createQuery({
        resourceId: "res_partial",
        includeLatestDeployment: false,
        includeAccessSummary: false,
        includeProfileDiagnostics: true,
      }),
    );

    const detail = unwrap(result);
    expect(detail.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "resource_source_profile_missing",
      "resource_runtime_profile_missing",
      "resource_network_profile_missing",
    ]);
    expect(detail.accessSummary).toBeUndefined();
    expect(detail.latestDeployment).toBeUndefined();
  });
});
