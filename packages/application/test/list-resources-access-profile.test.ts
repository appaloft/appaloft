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

import { createExecutionContext, type toRepositoryContext } from "../src";
import {
  type DefaultAccessDomainProvider,
  type DefaultAccessDomainRequest,
  type DestinationRepository,
  type ResourceReadModel,
  type ResourceSummary,
  type ServerRepository,
} from "../src/ports";
import { ListResourcesQueryService } from "../src/use-cases";

class StaticResourceReadModel implements ResourceReadModel {
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
) {
  return {
    provider,
    service: new ListResourcesQueryService(
      new StaticResourceReadModel([resource]),
      new StaticDestinationRepository(),
      new StaticServerRepository(),
      provider,
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
});
