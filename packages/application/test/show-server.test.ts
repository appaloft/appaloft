import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type DeploymentTargetByIdSpec,
  type DeploymentTargetByProviderAndHostSpec,
  type DeploymentTargetSelectionSpecVisitor,
  type ServerSelectionSpec,
} from "@appaloft/core";

import {
  createExecutionContext,
  type ExecutionContext,
  type RepositoryContext,
} from "../src/execution-context";
import { ShowServerQuery } from "../src/messages";
import {
  type DeploymentLogSummary,
  type DeploymentReadModel,
  type DeploymentSummary,
  type DomainBindingReadModel,
  type DomainBindingSummary,
  type ServerReadModel,
  type ServerSummary,
} from "../src/ports";
import { ShowServerQueryService } from "../src/use-cases";

class FixedClock {
  now(): string {
    return "2026-01-01T00:00:10.000Z";
  }
}

class ServerIdSelectionVisitor implements DeploymentTargetSelectionSpecVisitor<string | null> {
  visitDeploymentTargetById(_query: string | null, spec: DeploymentTargetByIdSpec): string | null {
    return spec.id.value;
  }

  visitDeploymentTargetByProviderAndHost(
    query: string | null,
    _spec: DeploymentTargetByProviderAndHostSpec,
  ): string | null {
    return query;
  }
}

class StaticServerReadModel implements ServerReadModel {
  constructor(private readonly servers: ServerSummary[]) {}

  async list(): Promise<ServerSummary[]> {
    return this.servers;
  }

  async findOne(_context: RepositoryContext, spec: ServerSelectionSpec) {
    const serverId = spec.accept(null, new ServerIdSelectionVisitor());
    return this.servers.find((server) => server.id === serverId) ?? null;
  }
}

class StaticDeploymentReadModel implements DeploymentReadModel {
  public listCalls = 0;

  constructor(private readonly deployments: DeploymentSummary[]) {}

  async list(): Promise<DeploymentSummary[]> {
    this.listCalls += 1;
    return this.deployments;
  }

  async findOne(): Promise<DeploymentSummary | null> {
    return null;
  }

  async findLogs(): Promise<DeploymentLogSummary[]> {
    return [];
  }
}

class StaticDomainBindingReadModel implements DomainBindingReadModel {
  public listCalls = 0;

  constructor(private readonly domainBindings: DomainBindingSummary[]) {}

  async list(): Promise<DomainBindingSummary[]> {
    this.listCalls += 1;
    return this.domainBindings;
  }
}

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_show_server_test",
    entrypoint: "system",
  });
}

function serverSummary(overrides?: Partial<ServerSummary>): ServerSummary {
  return {
    id: "srv_primary",
    name: "Primary",
    host: "203.0.113.10",
    port: 22,
    providerKey: "generic-ssh",
    lifecycleStatus: "active",
    edgeProxy: {
      kind: "traefik",
      status: "ready",
      lastAttemptAt: "2026-01-01T00:00:01.000Z",
      lastSucceededAt: "2026-01-01T00:00:02.000Z",
    },
    credential: {
      kind: "ssh-private-key",
      credentialId: "cred_primary",
      credentialName: "primary-key",
      username: "deploy",
      publicKeyConfigured: true,
      privateKeyConfigured: true,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function deploymentSummary(overrides?: Partial<DeploymentSummary>): DeploymentSummary {
  return {
    id: "dep_one",
    projectId: "prj_demo",
    environmentId: "env_demo",
    resourceId: "res_web",
    serverId: "srv_primary",
    destinationId: "dst_primary",
    status: "succeeded",
    createdAt: "2026-01-01T00:00:03.000Z",
    logs: [],
    logCount: 0,
    runtimePlan: {} as DeploymentSummary["runtimePlan"],
    environmentSnapshot: {} as DeploymentSummary["environmentSnapshot"],
    ...overrides,
  } as DeploymentSummary;
}

function domainBindingSummary(overrides?: Partial<DomainBindingSummary>): DomainBindingSummary {
  return {
    id: "dom_one",
    projectId: "prj_demo",
    environmentId: "env_demo",
    resourceId: "res_web",
    serverId: "srv_primary",
    destinationId: "dst_primary",
    domainName: "web.example.com",
    pathPrefix: "/",
    proxyKind: "traefik",
    tlsMode: "auto",
    certificatePolicy: "auto",
    status: "ready",
    verificationAttemptCount: 1,
    createdAt: "2026-01-01T00:00:04.000Z",
    ...overrides,
  };
}

function createService(input?: {
  servers?: ServerSummary[];
  deployments?: DeploymentSummary[];
  domainBindings?: DomainBindingSummary[];
}) {
  const deploymentReadModel = new StaticDeploymentReadModel(input?.deployments ?? []);
  const domainBindingReadModel = new StaticDomainBindingReadModel(input?.domainBindings ?? []);
  const service = new ShowServerQueryService(
    new StaticServerReadModel(input?.servers ?? [serverSummary()]),
    deploymentReadModel,
    domainBindingReadModel,
    new FixedClock(),
  );

  return { deploymentReadModel, domainBindingReadModel, service };
}

function createQuery(input?: Partial<Parameters<typeof ShowServerQuery.create>[0]>) {
  const result = ShowServerQuery.create({
    serverId: "srv_primary",
    ...input,
  });

  expect(result.isOk()).toBe(true);

  if (result.isErr()) {
    throw new Error("Expected ShowServerQuery creation to succeed");
  }

  return result.value;
}

describe("ShowServerQueryService", () => {
  test("[SRV-LIFE-SHOW-001] servers.show returns identity, credential, and proxy summary", async () => {
    const { service } = createService();

    const result = await service.execute(createTestContext(), createQuery());

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw new Error(result.error.message);
    }

    expect(result.value).toMatchObject({
      schemaVersion: "servers.show/v1",
      server: {
        id: "srv_primary",
        credential: {
          credentialName: "primary-key",
          privateKeyConfigured: true,
        },
        edgeProxy: {
          kind: "traefik",
          status: "ready",
        },
      },
      generatedAt: "2026-01-01T00:00:10.000Z",
    });
  });

  test("[SRV-LIFE-SHOW-002] servers.show returns not_found for a missing server", async () => {
    const { service } = createService({ servers: [] });

    const result = await service.execute(createTestContext(), createQuery());

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected missing server to fail");
    }

    expect(result.error.code).toBe("not_found");
    expect(result.error.retryable).toBe(false);
    expect(result.error.details).toMatchObject({
      queryName: "servers.show",
      phase: "server-read",
      serverId: "srv_primary",
    });
  });

  test("[SRV-LIFE-SHOW-003] servers.show returns deployment, resource, and domain rollups", async () => {
    const { service } = createService({
      deployments: [
        deploymentSummary({
          id: "dep_old",
          resourceId: "res_worker",
          status: "failed",
          createdAt: "2026-01-01T00:00:02.000Z",
        }),
        deploymentSummary({
          id: "dep_latest",
          resourceId: "res_web",
          status: "succeeded",
          createdAt: "2026-01-01T00:00:05.000Z",
        }),
        deploymentSummary({
          id: "dep_other_server",
          resourceId: "res_other",
          serverId: "srv_other",
          status: "running",
          createdAt: "2026-01-01T00:00:06.000Z",
        }),
      ],
      domainBindings: [
        domainBindingSummary({
          id: "dom_old",
          resourceId: "res_worker",
          status: "failed",
          createdAt: "2026-01-01T00:00:03.000Z",
        }),
        domainBindingSummary({
          id: "dom_latest",
          resourceId: "res_web",
          status: "ready",
          createdAt: "2026-01-01T00:00:07.000Z",
        }),
        domainBindingSummary({
          id: "dom_other_server",
          resourceId: "res_other",
          serverId: "srv_other",
          status: "bound",
          createdAt: "2026-01-01T00:00:08.000Z",
        }),
      ],
    });

    const result = await service.execute(createTestContext(), createQuery());

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw new Error(result.error.message);
    }

    expect(result.value.rollups).toEqual({
      resources: {
        total: 2,
        deployedResourceIds: ["res_web", "res_worker"],
      },
      deployments: {
        total: 2,
        statusCounts: [
          { status: "failed", count: 1 },
          { status: "succeeded", count: 1 },
        ],
        latestDeploymentId: "dep_latest",
        latestDeploymentStatus: "succeeded",
      },
      domains: {
        total: 2,
        statusCounts: [
          { status: "failed", count: 1 },
          { status: "ready", count: 1 },
        ],
        latestDomainBindingId: "dom_latest",
        latestDomainBindingStatus: "ready",
      },
    });
  });

  test("[SRV-LIFE-SHOW-004] servers.show can omit rollups", async () => {
    const { deploymentReadModel, domainBindingReadModel, service } = createService({
      deployments: [deploymentSummary()],
      domainBindings: [domainBindingSummary()],
    });

    const result = await service.execute(
      createTestContext(),
      createQuery({ includeRollups: false }),
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw new Error(result.error.message);
    }

    expect(result.value.rollups).toBeUndefined();
    expect(deploymentReadModel.listCalls).toBe(0);
    expect(domainBindingReadModel.listCalls).toBe(0);
  });
});
