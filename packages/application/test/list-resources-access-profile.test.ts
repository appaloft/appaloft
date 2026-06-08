import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeploymentTarget,
  type DeploymentTargetByIdSpec,
  DeploymentTargetId,
  DeploymentTargetName,
  Destination,
  type DestinationByIdSpec,
  DestinationKindValue,
  DestinationName,
  EdgeProxyKindValue,
  HostAddress,
  ok,
  PortNumber,
  ProviderKey,
  UpdatedAt,
} from "@appaloft/core";

import { createExecutionContext, type ExecutionContext, type toRepositoryContext } from "../src";
import {
  type DefaultAccessDomainProvider,
  type DefaultAccessDomainRequest,
  type DestinationRepository,
  type ResourceReadModel,
  type ResourceSummary,
  type ServerRepository,
  type StaticArtifactPublicationReadModelPort,
  type StaticArtifactPublicationSummary,
} from "../src/ports";
import { ListResourcesQueryService } from "../src/use-cases";

class StaticResourceReadModel implements ResourceReadModel {
  async count(): Promise<number> {
    return 0;
  }

  constructor(private readonly resources: ResourceSummary[]) {}

  async list(): Promise<ResourceSummary[]> {
    return this.resources;
  }

  async findOne(): Promise<ResourceSummary | null> {
    return this.resources[0] ?? null;
  }
}

class StaticDestinationRepository implements DestinationRepository {
  async findOne(
    _context: ReturnType<typeof toRepositoryContext>,
    spec: DestinationByIdSpec,
  ): Promise<Destination | null> {
    return Destination.register({
      id: spec.id,
      serverId: DeploymentTargetId.rehydrate("srv_demo"),
      name: DestinationName.rehydrate("default"),
      kind: DestinationKindValue.rehydrate("generic"),
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();
  }

  async upsert(): Promise<void> {}
}

class StaticServerRepository implements ServerRepository {
  async findOne(
    _context: ReturnType<typeof toRepositoryContext>,
    spec: DeploymentTargetByIdSpec,
  ): Promise<DeploymentTarget | null> {
    const server = DeploymentTarget.register({
      id: spec.id,
      name: DeploymentTargetName.rehydrate("demo-server"),
      host: HostAddress.rehydrate("203.0.113.10"),
      port: PortNumber.rehydrate(22),
      providerKey: ProviderKey.rehydrate("generic-ssh"),
      edgeProxyKind: EdgeProxyKindValue.rehydrate("traefik"),
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();
    server
      .markEdgeProxyReady({
        completedAt: UpdatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })
      ._unsafeUnwrap();
    return server;
  }

  async upsert(): Promise<void> {}
}

class CapturingDefaultAccessDomainProvider implements DefaultAccessDomainProvider {
  public readonly calls: DefaultAccessDomainRequest[] = [];

  async generate(_context: unknown, input: DefaultAccessDomainRequest) {
    this.calls.push(input);
    return ok({
      kind: "generated" as const,
      domain: {
        hostname: "web.203-0-113-10.sslip.io",
        scheme: "http" as const,
        providerKey: "sslip",
      },
    });
  }
}

class StaticArtifactPublicationReadModel implements StaticArtifactPublicationReadModelPort {
  public readonly calls: Array<{
    projectId?: string;
    resourceId?: string;
    limit?: number;
  }> = [];

  constructor(private readonly publications: StaticArtifactPublicationSummary[]) {}

  async listPublications(
    _context: ExecutionContext,
    input?: {
      projectId?: string;
      resourceId?: string;
      limit?: number;
    },
  ) {
    this.calls.push(input ?? {});
    return ok({
      items: this.publications
        .filter((publication) =>
          input?.projectId ? publication.projectId === input.projectId : true,
        )
        .filter((publication) =>
          input?.resourceId ? publication.resourceId === input.resourceId : true,
        )
        .slice(0, input?.limit ?? this.publications.length),
    });
  }
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
    createdAt: "2026-01-01T00:00:00.000Z",
    services: [],
    networkProfile: {
      internalPort: 3000,
      upstreamProtocol: "http",
      exposureMode: "reverse-proxy",
    },
    deploymentCount: 0,
    ...overrides,
  };
}

function createService(
  resource: ResourceSummary,
  provider = new CapturingDefaultAccessDomainProvider(),
  staticArtifactPublicationReadModel?: StaticArtifactPublicationReadModel,
) {
  return {
    provider,
    staticArtifactPublicationReadModel,
    service: new ListResourcesQueryService(
      new StaticResourceReadModel([resource]),
      new StaticDestinationRepository(),
      new StaticServerRepository(),
      provider,
      staticArtifactPublicationReadModel,
    ),
  };
}

describe("ListResourcesQueryService access profile projection", () => {
  test("[RES-PROFILE-ACCESS-001] omits planned generated access when resource access profile is disabled", async () => {
    const { provider, service } = createService(
      resourceSummary({
        accessProfile: {
          generatedAccessMode: "disabled",
          pathPrefix: "/",
        },
      }),
    );

    const result = await service.execute(
      createExecutionContext({
        requestId: "req_list_resources_access_disabled_test",
        entrypoint: "system",
      }),
    );

    expect(result.items[0]?.accessSummary?.plannedGeneratedAccessRoute).toBeUndefined();
    expect(provider.calls).toHaveLength(0);
  });

  test("[RES-PROFILE-ACCESS-003] uses resource access path prefix for planned generated routes", async () => {
    const { provider, service } = createService(
      resourceSummary({
        accessProfile: {
          generatedAccessMode: "inherit",
          pathPrefix: "/docs",
        },
      }),
    );

    const result = await service.execute(
      createExecutionContext({
        requestId: "req_list_resources_access_path_test",
        entrypoint: "system",
      }),
    );

    expect(result.items[0]?.accessSummary?.plannedGeneratedAccessRoute).toMatchObject({
      url: "http://web.203-0-113-10.sslip.io/docs",
      pathPrefix: "/docs",
      targetPort: 3000,
      proxyKind: "traefik",
    });
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]).toMatchObject({
      resourceId: "res_web",
      routePurpose: "default-resource-access",
    });
  });

  test("[DEF-ACCESS-QRY-001] omits planned generated access after deployment history exists", async () => {
    const { provider, service } = createService(
      resourceSummary({
        deploymentCount: 1,
        lastDeploymentId: "dep_old",
        lastDeploymentStatus: "succeeded",
      }),
    );

    const result = await service.execute(
      createExecutionContext({
        requestId: "req_list_resources_access_after_deploy_test",
        entrypoint: "system",
      }),
    );

    expect(result.items[0]?.accessSummary?.plannedGeneratedAccessRoute).toBeUndefined();
    expect(provider.calls).toHaveLength(0);
  });

  test("[CLOUD-STATIC-DEPLOY-157] projects latest serverless static publication as a resource access route", async () => {
    const publications = new StaticArtifactPublicationReadModel([
      {
        publicationId: "pub_static_current",
        projectId: "prj_demo",
        resourceId: "res_web",
        artifactId: "artifact_static_current",
        manifestDigest: "manifest-digest",
        storageRef: "s3-compatible://bucket/publications/manifest.json",
        storeProviderKey: "cloud-static-artifact-store",
        routeUrl: "https://www-static-demo.appaloft.app/",
        routeProviderKey: "cloud-static-artifact-route",
        fileCount: 3,
        totalBytes: 2048,
        publishedAt: "2026-01-01T00:00:04.000Z",
      },
    ]);
    const { service, staticArtifactPublicationReadModel } = createService(
      resourceSummary({
        destinationId: undefined,
        networkProfile: undefined,
        deploymentCount: 0,
      }),
      new CapturingDefaultAccessDomainProvider(),
      publications,
    );

    const result = await service.execute(
      createExecutionContext({
        requestId: "req_list_resources_static_artifact_access_test",
        entrypoint: "system",
      }),
    );

    expect(result.items[0]?.accessSummary?.latestStaticArtifactRoute).toEqual({
      url: "https://www-static-demo.appaloft.app/",
      hostname: "www-static-demo.appaloft.app",
      scheme: "https",
      providerKey: "cloud-static-artifact-route",
      publicationId: "pub_static_current",
      artifactId: "artifact_static_current",
      pathPrefix: "/",
      fileCount: 3,
      totalBytes: 2048,
      updatedAt: "2026-01-01T00:00:04.000Z",
    });
    expect(staticArtifactPublicationReadModel?.calls).toEqual([
      {
        projectId: "prj_demo",
        resourceId: "res_web",
        limit: 1,
      },
    ]);
  });
});
