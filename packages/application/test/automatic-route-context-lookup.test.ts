import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import { createExecutionContext, type RepositoryContext } from "../src";
import {
  type DeploymentReadModel,
  type DeploymentSummary,
  type DomainBindingReadModel,
  type DomainBindingSummary,
  type ResourceReadModel,
  type ResourceSummary,
} from "../src/ports";
import { AutomaticRouteContextLookupService } from "../src/use-cases";

const createdAt = "2026-01-01T00:00:00.000Z";
const updatedAt = "2026-01-01T00:01:00.000Z";

function createResource(
  input: Partial<ResourceSummary> & Pick<ResourceSummary, "id" | "projectId" | "environmentId">,
): ResourceSummary {
  const { id, projectId, environmentId, ...rest } = input;

  return {
    id,
    projectId,
    environmentId,
    destinationId: "dst_default",
    name: id,
    slug: id,
    kind: "application",
    createdAt,
    services: [],
    deploymentCount: 1,
    ...rest,
  };
}

function createDeployment(input: {
  id: string;
  projectId?: string;
  environmentId?: string;
  resourceId?: string;
  serverId?: string;
  destinationId?: string;
  status?: DeploymentSummary["status"];
}): DeploymentSummary {
  return {
    id: input.id,
    projectId: input.projectId ?? "prj_web",
    environmentId: input.environmentId ?? "env_prod",
    resourceId: input.resourceId ?? "res_web",
    serverId: input.serverId ?? "srv_web",
    destinationId: input.destinationId ?? "dst_web",
    status: input.status ?? "succeeded",
    runtimePlan: {
      id: `plan_${input.id}`,
      source: {
        kind: "git-public",
        locator: "https://example.test/app.git",
        displayName: "app",
      },
      buildStrategy: "dockerfile",
      packagingMode: "all-in-one-docker",
      execution: {
        kind: "docker-container",
      },
      target: {
        kind: "single-server",
        providerKey: "ssh",
        serverIds: ["srv_web"],
      },
      detectSummary: "test",
      generatedAt: createdAt,
      steps: [],
    },
    environmentSnapshot: {
      id: `snap_${input.id}`,
      environmentId: "env_prod",
      createdAt,
      precedence: [],
      variables: [],
    },
    logs: [],
    createdAt,
    logCount: 0,
  };
}

function createDomainBinding(input: Partial<DomainBindingSummary>): DomainBindingSummary {
  return {
    id: "dbnd_web",
    projectId: "prj_web",
    environmentId: "env_prod",
    resourceId: "res_web",
    serverId: "srv_web",
    destinationId: "dst_web",
    domainName: "app.example.test",
    pathPrefix: "/",
    proxyKind: "traefik",
    tlsMode: "auto",
    certificatePolicy: "auto",
    status: "ready",
    verificationAttemptCount: 1,
    createdAt,
    ...input,
  };
}

class StaticResourceReadModel implements ResourceReadModel {
  constructor(private readonly resources: ResourceSummary[]) {}

  async list(
    _context: RepositoryContext,
    input?: { projectId?: string; environmentId?: string },
  ): Promise<ResourceSummary[]> {
    return this.resources.filter(
      (resource) =>
        (!input?.projectId || resource.projectId === input.projectId) &&
        (!input?.environmentId || resource.environmentId === input.environmentId),
    );
  }

  async findOne(): Promise<ResourceSummary | null> {
    return null;
  }
}

class StaticDomainBindingReadModel implements DomainBindingReadModel {
  constructor(private readonly bindings: DomainBindingSummary[]) {}

  async list(
    _context: RepositoryContext,
    input?: { projectId?: string; environmentId?: string; resourceId?: string },
  ): Promise<DomainBindingSummary[]> {
    return this.bindings.filter(
      (binding) =>
        (!input?.projectId || binding.projectId === input.projectId) &&
        (!input?.environmentId || binding.environmentId === input.environmentId) &&
        (!input?.resourceId || binding.resourceId === input.resourceId),
    );
  }
}

class StaticDeploymentReadModel implements DeploymentReadModel {
  constructor(private readonly deployments: DeploymentSummary[]) {}

  async list(
    _context: RepositoryContext,
    input?: { projectId?: string; resourceId?: string },
  ): Promise<DeploymentSummary[]> {
    return this.deployments.filter(
      (deployment) =>
        (!input?.projectId || deployment.projectId === input.projectId) &&
        (!input?.resourceId || deployment.resourceId === input.resourceId),
    );
  }

  async findOne(): Promise<DeploymentSummary | null> {
    return null;
  }

  async findLogs(): Promise<[]> {
    return [];
  }
}

function createService(input: {
  resources: ResourceSummary[];
  bindings?: DomainBindingSummary[];
  deployments?: DeploymentSummary[];
}) {
  return new AutomaticRouteContextLookupService(
    new StaticResourceReadModel(input.resources),
    new StaticDomainBindingReadModel(input.bindings ?? []),
    new StaticDeploymentReadModel(input.deployments ?? []),
  );
}

describe("automatic route context lookup", () => {
  test("[RES-ACCESS-DIAG-CONTEXT-001] resolves generated access route by hostname and path", async () => {
    const service = createService({
      resources: [
        createResource({
          id: "res_web",
          projectId: "prj_web",
          environmentId: "env_prod",
          destinationId: "dst_web",
          accessSummary: {
            latestGeneratedAccessRoute: {
              url: "https://web.appaloft.test/",
              hostname: "web.appaloft.test",
              scheme: "https",
              providerKey: "traefik",
              deploymentId: "dep_web",
              deploymentStatus: "succeeded",
              pathPrefix: "/",
              proxyKind: "traefik",
              updatedAt,
            },
            proxyRouteStatus: "ready",
          },
        }),
      ],
      deployments: [createDeployment({ id: "dep_web" })],
    });

    const result = await service.lookup(createExecutionContext({ entrypoint: "cli" }), {
      hostname: "WEB.APPALOFT.TEST",
      path: "/private?token=secret",
    });

    expect(result).toMatchObject({
      status: "found",
      matchedSource: "generated-access-route",
      resourceId: "res_web",
      deploymentId: "dep_web",
      destinationId: "dst_web",
      serverId: "srv_web",
      routeSource: "generated-default",
      routeStatus: "ready",
      confidence: "high",
      nextAction: "diagnostic-summary",
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  test("[RES-ACCESS-DIAG-CONTEXT-002] resolves durable domain binding route with binding id", async () => {
    const service = createService({
      resources: [
        createResource({
          id: "res_web",
          projectId: "prj_web",
          environmentId: "env_prod",
          accessSummary: {
            latestDurableDomainRoute: {
              url: "https://app.example.test/admin",
              hostname: "app.example.test",
              scheme: "https",
              providerKey: "traefik",
              deploymentId: "dep_web",
              deploymentStatus: "succeeded",
              pathPrefix: "/admin",
              proxyKind: "traefik",
              updatedAt,
            },
            proxyRouteStatus: "ready",
          },
        }),
      ],
      bindings: [createDomainBinding({ pathPrefix: "/admin" })],
      deployments: [createDeployment({ id: "dep_web" })],
    });

    const result = await service.lookup(createExecutionContext({ entrypoint: "cli" }), {
      hostname: "app.example.test",
      path: "/admin/settings",
    });

    expect(result).toMatchObject({
      status: "found",
      matchedSource: "durable-domain-binding-route",
      resourceId: "res_web",
      deploymentId: "dep_web",
      domainBindingId: "dbnd_web",
      serverId: "srv_web",
      destinationId: "dst_web",
      routeSource: "durable-domain",
      routeStatus: "ready",
      confidence: "high",
    });
  });

  test("[RES-ACCESS-DIAG-CONTEXT-003] resolves server-applied route ahead of generated access", async () => {
    const service = createService({
      resources: [
        createResource({
          id: "res_web",
          projectId: "prj_web",
          environmentId: "env_prod",
          accessSummary: {
            latestGeneratedAccessRoute: {
              url: "https://app.example.test/",
              hostname: "app.example.test",
              scheme: "https",
              deploymentId: "dep_old",
              deploymentStatus: "succeeded",
              pathPrefix: "/",
              proxyKind: "traefik",
              updatedAt,
            },
            latestServerAppliedDomainRoute: {
              url: "https://app.example.test/",
              hostname: "app.example.test",
              scheme: "https",
              deploymentId: "dep_web",
              deploymentStatus: "succeeded",
              pathPrefix: "/",
              proxyKind: "traefik",
              updatedAt,
            },
            proxyRouteStatus: "ready",
          },
        }),
      ],
      deployments: [createDeployment({ id: "dep_web" })],
    });

    const result = await service.lookup(createExecutionContext({ entrypoint: "cli" }), {
      hostname: "app.example.test",
      path: "/",
      routeSource: "generated-default",
    });

    expect(result).toMatchObject({
      status: "found",
      matchedSource: "server-applied-route",
      routeSource: "server-applied",
      deploymentId: "dep_web",
      confidence: "medium",
    });
  });

  test("[RES-ACCESS-DIAG-CONTEXT-004] keeps precedence stable and uses longest path within source", async () => {
    const service = createService({
      resources: [
        createResource({
          id: "res_root",
          projectId: "prj_web",
          environmentId: "env_prod",
          accessSummary: {
            latestDurableDomainRoute: {
              url: "https://app.example.test/",
              hostname: "app.example.test",
              scheme: "https",
              deploymentId: "dep_root",
              deploymentStatus: "succeeded",
              pathPrefix: "/",
              proxyKind: "traefik",
              updatedAt,
            },
          },
        }),
        createResource({
          id: "res_admin",
          projectId: "prj_web",
          environmentId: "env_prod",
          accessSummary: {
            latestDurableDomainRoute: {
              url: "https://app.example.test/admin",
              hostname: "app.example.test",
              scheme: "https",
              deploymentId: "dep_admin",
              deploymentStatus: "succeeded",
              pathPrefix: "/admin",
              proxyKind: "traefik",
              updatedAt,
            },
          },
        }),
      ],
      bindings: [
        createDomainBinding({ id: "dbnd_root", resourceId: "res_root", pathPrefix: "/" }),
        createDomainBinding({ id: "dbnd_admin", resourceId: "res_admin", pathPrefix: "/admin" }),
      ],
      deployments: [
        createDeployment({ id: "dep_root", resourceId: "res_root" }),
        createDeployment({ id: "dep_admin", resourceId: "res_admin" }),
      ],
    });

    const result = await service.lookup(createExecutionContext({ entrypoint: "cli" }), {
      hostname: "app.example.test",
      path: "/admin/users",
    });

    expect(result).toMatchObject({
      status: "found",
      resourceId: "res_admin",
      deploymentId: "dep_admin",
      domainBindingId: "dbnd_admin",
      matchedSource: "durable-domain-binding-route",
    });
  });

  test("[RES-ACCESS-DIAG-CONTEXT-005] returns safe not-found without unrelated ids", async () => {
    const service = createService({
      resources: [
        createResource({
          id: "res_web",
          projectId: "prj_web",
          environmentId: "env_prod",
          accessSummary: {
            latestGeneratedAccessRoute: {
              url: "https://web.appaloft.test/",
              hostname: "web.appaloft.test",
              scheme: "https",
              deploymentId: "dep_web",
              deploymentStatus: "succeeded",
              pathPrefix: "/",
              proxyKind: "traefik",
              updatedAt,
            },
          },
        }),
      ],
    });

    const result = await service.lookup(createExecutionContext({ entrypoint: "cli" }), {
      hostname: "missing.example.test",
      path: "/",
    });

    expect(result).toMatchObject({
      status: "not-found",
      matchedSource: "not-found",
      nextAction: "diagnostic-summary",
      notFound: {
        code: "resource_access_route_context_not_found",
        phase: "route-context-lookup",
      },
    });
    expect(JSON.stringify(result)).not.toContain("res_web");
    expect(JSON.stringify(result)).not.toContain("dep_web");
  });
});
