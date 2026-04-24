import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  DeploymentByIdSpec,
  DeploymentTargetByIdSpec,
  EnvironmentByIdSpec,
  ProjectByIdSpec,
  ResourceByIdSpec,
  type Result,
} from "@appaloft/core";

import { createExecutionContext, type ExecutionContext, type toRepositoryContext } from "../src";
import { ShowDeploymentQuery } from "../src/messages";
import {
  type DeploymentDetail,
  type DeploymentLogSummary,
  type DeploymentReadModel,
  type DeploymentSummary,
  type EnvironmentReadModel,
  type EnvironmentSummary,
  type ProjectReadModel,
  type ProjectSummary,
  type ResourceReadModel,
  type ResourceSummary,
  type ServerReadModel,
  type ServerSummary,
} from "../src/ports";
import { ShowDeploymentQueryService } from "../src/use-cases";

class FixedClock {
  now(): string {
    return "2026-01-01T00:00:10.000Z";
  }
}

class StaticProjectReadModel implements ProjectReadModel {
  public listCalls = 0;
  public findOneCalls = 0;

  constructor(private readonly projects: ProjectSummary[] = []) {}

  async list(_context: ReturnType<typeof toRepositoryContext>): Promise<ProjectSummary[]> {
    this.listCalls += 1;
    return this.projects;
  }

  async findOne(
    _context: ReturnType<typeof toRepositoryContext>,
    spec: Parameters<ProjectReadModel["findOne"]>[1],
  ): Promise<ProjectSummary | null> {
    this.findOneCalls += 1;
    if (spec instanceof ProjectByIdSpec) {
      return this.projects.find((project) => project.id === spec.id.value) ?? null;
    }
    return null;
  }
}

class StaticEnvironmentReadModel implements EnvironmentReadModel {
  public listCalls = 0;
  public findOneCalls = 0;

  constructor(private readonly environments: EnvironmentSummary[] = []) {}

  async list(
    _context: ReturnType<typeof toRepositoryContext>,
    projectId?: string,
  ): Promise<EnvironmentSummary[]> {
    this.listCalls += 1;
    return projectId
      ? this.environments.filter((environment) => environment.projectId === projectId)
      : this.environments;
  }

  async findOne(
    _context: ReturnType<typeof toRepositoryContext>,
    spec: Parameters<EnvironmentReadModel["findOne"]>[1],
  ): Promise<EnvironmentSummary | null> {
    this.findOneCalls += 1;
    if (spec instanceof EnvironmentByIdSpec) {
      return this.environments.find((environment) => environment.id === spec.id.value) ?? null;
    }
    return null;
  }
}

class StaticResourceReadModel implements ResourceReadModel {
  public listCalls = 0;
  public findOneCalls = 0;

  constructor(private readonly resources: ResourceSummary[] = []) {}

  async list(
    _context: ReturnType<typeof toRepositoryContext>,
    input?: {
      projectId?: string;
      environmentId?: string;
    },
  ): Promise<ResourceSummary[]> {
    this.listCalls += 1;
    return this.resources
      .filter((resource) => (input?.projectId ? resource.projectId === input.projectId : true))
      .filter((resource) =>
        input?.environmentId ? resource.environmentId === input.environmentId : true,
      );
  }

  async findOne(
    _context: ReturnType<typeof toRepositoryContext>,
    spec: Parameters<ResourceReadModel["findOne"]>[1],
  ): Promise<ResourceSummary | null> {
    this.findOneCalls += 1;
    if (spec instanceof ResourceByIdSpec) {
      return this.resources.find((resource) => resource.id === spec.id.value) ?? null;
    }
    return null;
  }
}

class StaticServerReadModel implements ServerReadModel {
  public listCalls = 0;
  public findOneCalls = 0;

  constructor(private readonly servers: ServerSummary[] = []) {}

  async list(_context: ReturnType<typeof toRepositoryContext>): Promise<ServerSummary[]> {
    this.listCalls += 1;
    return this.servers;
  }

  async findOne(
    _context: ReturnType<typeof toRepositoryContext>,
    spec: Parameters<ServerReadModel["findOne"]>[1],
  ): Promise<ServerSummary | null> {
    this.findOneCalls += 1;
    if (spec instanceof DeploymentTargetByIdSpec) {
      return this.servers.find((server) => server.id === spec.id.value) ?? null;
    }
    return null;
  }
}

class StaticDeploymentReadModel implements DeploymentReadModel {
  public listCalls = 0;
  public findOneCalls = 0;
  public findLogsCalls = 0;

  constructor(private readonly deployments: DeploymentSummary[] = []) {}

  async list(
    _context: ReturnType<typeof toRepositoryContext>,
    input?: {
      projectId?: string;
      resourceId?: string;
    },
  ): Promise<DeploymentSummary[]> {
    this.listCalls += 1;
    return this.deployments
      .filter((deployment) => (input?.projectId ? deployment.projectId === input.projectId : true))
      .filter((deployment) =>
        input?.resourceId ? deployment.resourceId === input.resourceId : true,
      );
  }

  async findOne(
    _context: ReturnType<typeof toRepositoryContext>,
    spec: Parameters<DeploymentReadModel["findOne"]>[1],
  ): Promise<DeploymentSummary | null> {
    this.findOneCalls += 1;
    if (spec instanceof DeploymentByIdSpec) {
      return this.deployments.find((deployment) => deployment.id === spec.id.value) ?? null;
    }
    return null;
  }

  async findLogs(
    _context: ReturnType<typeof toRepositoryContext>,
    id: string,
  ): Promise<DeploymentLogSummary[]> {
    this.findLogsCalls += 1;
    return this.deployments.find((deployment) => deployment.id === id)?.logs ?? [];
  }
}

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_show_deployment_test",
    entrypoint: "system",
  });
}

function projectSummary(overrides?: Partial<ProjectSummary>): ProjectSummary {
  const { lifecycleStatus = "active", ...rest } = overrides ?? {};

  return {
    id: "prj_demo",
    name: "Demo",
    slug: "demo",
    lifecycleStatus,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...rest,
  };
}

function environmentSummary(overrides?: Partial<EnvironmentSummary>): EnvironmentSummary {
  return {
    id: "env_demo",
    projectId: "prj_demo",
    name: "Production",
    kind: "production",
    maskedVariables: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
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
    deploymentCount: 1,
    lastDeploymentId: "dep_demo",
    lastDeploymentStatus: "failed",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function serverSummary(overrides?: Partial<ServerSummary>): ServerSummary {
  return {
    id: "srv_demo",
    name: "Primary",
    host: "203.0.113.10",
    port: 22,
    providerKey: "local-shell",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function deploymentSummary(overrides?: Partial<DeploymentSummary>): DeploymentSummary {
  return {
    id: "dep_demo",
    projectId: "prj_demo",
    environmentId: "env_demo",
    resourceId: "res_web",
    serverId: "srv_demo",
    destinationId: "dst_demo",
    status: "failed",
    runtimePlan: {
      id: "rplan_demo",
      source: {
        kind: "git-public",
        locator: "https://github.com/acme/web.git",
        displayName: "acme/web",
        metadata: {
          branch: "main",
        },
      },
      buildStrategy: "workspace-commands",
      packagingMode: "host-process-runtime",
      execution: {
        kind: "host-process",
        port: 3000,
        accessRoutes: [
          {
            proxyKind: "traefik",
            domains: ["web.demo.example.com"],
            pathPrefix: "/",
            tlsMode: "auto",
            targetPort: 3000,
          },
        ],
        metadata: {
          publicUrl: "https://web.demo.example.com",
        },
      },
      target: {
        kind: "single-server",
        providerKey: "local-shell",
        serverIds: ["srv_demo"],
      },
      detectSummary: "detected workspace",
      generatedAt: "2026-01-01T00:00:00.000Z",
      steps: ["detect", "plan", "deploy", "verify"],
    },
    environmentSnapshot: {
      id: "snap_demo",
      environmentId: "env_demo",
      createdAt: "2026-01-01T00:00:00.000Z",
      precedence: ["defaults", "project", "environment", "deployment"],
      variables: [
        {
          key: "NODE_ENV",
          value: "production",
          kind: "plain-config",
          exposure: "runtime",
          scope: "environment",
          isSecret: false,
        },
      ],
    },
    logs: [
      {
        timestamp: "2026-01-01T00:00:06.000Z",
        source: "appaloft",
        level: "info",
        phase: "plan",
        message: "Planning runtime",
      },
      {
        timestamp: "2026-01-01T00:00:07.000Z",
        source: "application",
        level: "warn",
        phase: "deploy",
        message: "App reported slow startup",
      },
      {
        timestamp: "2026-01-01T00:00:09.000Z",
        source: "appaloft",
        level: "error",
        phase: "verify",
        message: "Health check failed",
      },
    ],
    createdAt: "2026-01-01T00:00:05.000Z",
    startedAt: "2026-01-01T00:00:06.000Z",
    finishedAt: "2026-01-01T00:00:09.000Z",
    logCount: 3,
    ...overrides,
  };
}

function createService(input?: {
  deployments?: DeploymentSummary[];
  projects?: ProjectSummary[];
  environments?: EnvironmentSummary[];
  resources?: ResourceSummary[];
  servers?: ServerSummary[];
}) {
  const deploymentReadModel = new StaticDeploymentReadModel(
    input?.deployments ?? [deploymentSummary()],
  );
  const projectReadModel = new StaticProjectReadModel(input?.projects ?? [projectSummary()]);
  const environmentReadModel = new StaticEnvironmentReadModel(
    input?.environments ?? [environmentSummary()],
  );
  const resourceReadModel = new StaticResourceReadModel(input?.resources ?? [resourceSummary()]);
  const serverReadModel = new StaticServerReadModel(input?.servers ?? [serverSummary()]);

  return {
    deploymentReadModel,
    projectReadModel,
    environmentReadModel,
    resourceReadModel,
    serverReadModel,
    service: new ShowDeploymentQueryService(
      deploymentReadModel,
      projectReadModel,
      environmentReadModel,
      resourceReadModel,
      serverReadModel,
      new FixedClock(),
    ),
  };
}

function createQuery(input?: Partial<Parameters<typeof ShowDeploymentQuery.create>[0]>) {
  return ShowDeploymentQuery.create({
    deploymentId: "dep_demo",
    includeTimeline: true,
    includeSnapshot: true,
    includeRelatedContext: true,
    includeLatestFailure: true,
    ...input,
  })._unsafeUnwrap();
}

function unwrap(result: Result<DeploymentDetail>): DeploymentDetail {
  expect(result.isOk()).toBe(true);
  return result._unsafeUnwrap();
}

describe("ShowDeploymentQueryService", () => {
  test("[DEP-SHOW-QRY-001] returns deployment detail with immutable snapshot and related context", async () => {
    const result = await createService().service.execute(createTestContext(), createQuery());

    const detail = unwrap(result);
    expect(detail.schemaVersion).toBe("deployments.show/v1");
    expect(detail.deployment).toMatchObject({
      id: "dep_demo",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_web",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      status: "failed",
    });
    expect("logs" in detail.deployment).toBe(false);
    expect(detail.relatedContext).toMatchObject({
      project: {
        id: "prj_demo",
        name: "Demo",
        slug: "demo",
      },
      environment: {
        id: "env_demo",
        name: "Production",
        kind: "production",
      },
      resource: {
        id: "res_web",
        name: "Web",
        slug: "web",
        kind: "application",
      },
      server: {
        id: "srv_demo",
        name: "Primary",
        host: "203.0.113.10",
        port: 22,
        providerKey: "local-shell",
      },
      destination: {
        id: "dst_demo",
      },
    });
    expect(detail.timeline).toEqual({
      createdAt: "2026-01-01T00:00:05.000Z",
      startedAt: "2026-01-01T00:00:06.000Z",
      finishedAt: "2026-01-01T00:00:09.000Z",
      logCount: 3,
    });
    expect(detail.snapshot).toMatchObject({
      runtimePlan: {
        execution: {
          port: 3000,
        },
      },
      environmentSnapshot: {
        id: "snap_demo",
        precedence: ["defaults", "project", "environment", "deployment"],
      },
    });
    expect(detail.latestFailure).toEqual({
      timestamp: "2026-01-01T00:00:09.000Z",
      source: "appaloft",
      phase: "verify",
      level: "error",
      message: "Health check failed",
    });
    expect(detail.nextActions).toEqual([
      "logs",
      "resource-detail",
      "resource-health",
      "diagnostic-summary",
    ]);
    expect(detail.sectionErrors).toEqual([]);
    expect(detail.generatedAt).toBe("2026-01-01T00:00:10.000Z");
  });

  test("[DEP-SHOW-QRY-002] returns not_found without querying related readers when deployment is missing", async () => {
    const harness = createService({
      deployments: [],
    });

    const result = await harness.service.execute(createTestContext(), createQuery());

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "not_found",
      details: {
        queryName: "deployments.show",
        phase: "deployment-resolution",
        deploymentId: "dep_demo",
      },
    });
    expect(harness.projectReadModel.findOneCalls).toBe(0);
    expect(harness.environmentReadModel.findOneCalls).toBe(0);
    expect(harness.resourceReadModel.findOneCalls).toBe(0);
    expect(harness.serverReadModel.findOneCalls).toBe(0);
  });

  test("[DEP-SHOW-QRY-004] returns section error when related context is unavailable", async () => {
    const result = await createService({
      resources: [],
    }).service.execute(createTestContext(), createQuery());

    const detail = unwrap(result);
    expect(detail.deployment.id).toBe("dep_demo");
    expect(detail.relatedContext).toMatchObject({
      resource: {
        id: "res_web",
      },
    });
    expect(detail.sectionErrors).toEqual([
      {
        section: "related-context",
        code: "deployment_related_context_unavailable",
        category: "application",
        phase: "related-context-resolution",
        retriable: false,
        relatedEntityId: "res_web",
      },
    ]);
  });
});
