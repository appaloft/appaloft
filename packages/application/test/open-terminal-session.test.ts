import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  DeploymentByIdSpec,
  DeploymentTargetByIdSpec,
  domainError,
  err,
  LatestDeploymentSpec,
  ok,
  ResourceByIdSpec,
  type Result,
} from "@appaloft/core";

import { createExecutionContext, type ExecutionContext, type RepositoryContext } from "../src";
import {
  CloseTerminalSessionCommand,
  ExpireTerminalSessionsCommand,
  ListTerminalSessionsQuery,
  OpenTerminalSessionCommand,
  ShowTerminalSessionQuery,
} from "../src/messages";
import {
  type DeploymentLogSummary,
  type DeploymentReadModel,
  type DeploymentSummary,
  type IdGenerator,
  type ResourceReadModel,
  type ResourceSummary,
  type ServerReadModel,
  type ServerSummary,
  type TerminalSession,
  type TerminalSessionDescriptor,
  type TerminalSessionGateway,
  type TerminalSessionOpenRequest,
  type TerminalSessionSummary,
} from "../src/ports";
import { OpenTerminalSessionUseCase, TerminalSessionLifecycleService } from "../src/use-cases";

class StaticIdGenerator implements IdGenerator {
  next(prefix: string): string {
    return `${prefix}_test`;
  }
}

class StaticServerReadModel implements ServerReadModel {
  constructor(private readonly servers: ServerSummary[]) {}

  async list(): Promise<ServerSummary[]> {
    return this.servers;
  }

  async findOne(
    _context: RepositoryContext,
    spec: Parameters<ServerReadModel["findOne"]>[1],
  ): Promise<ServerSummary | null> {
    if (spec instanceof DeploymentTargetByIdSpec) {
      return this.servers.find((server) => server.id === spec.id.value) ?? null;
    }
    return null;
  }
}

class StaticResourceReadModel implements ResourceReadModel {
  constructor(private readonly resources: ResourceSummary[]) {}

  async list(): Promise<ResourceSummary[]> {
    return this.resources;
  }

  async findOne(
    _context: RepositoryContext,
    spec: Parameters<ResourceReadModel["findOne"]>[1],
  ): Promise<ResourceSummary | null> {
    if (spec instanceof ResourceByIdSpec) {
      return this.resources.find((resource) => resource.id === spec.id.value) ?? null;
    }
    return null;
  }
}

class StaticDeploymentReadModel implements DeploymentReadModel {
  constructor(private readonly deployments: DeploymentSummary[]) {}

  async list(
    _context: RepositoryContext,
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

  async findOne(
    _context: RepositoryContext,
    spec: Parameters<DeploymentReadModel["findOne"]>[1],
  ): Promise<DeploymentSummary | null> {
    if (spec instanceof DeploymentByIdSpec) {
      return this.deployments.find((deployment) => deployment.id === spec.id.value) ?? null;
    }
    if (spec instanceof LatestDeploymentSpec) {
      return (
        [...this.deployments]
          .filter((deployment) => deployment.resourceId === spec.resourceId.value)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null
      );
    }
    return null;
  }

  async findLogs(): Promise<DeploymentLogSummary[]> {
    return [];
  }
}

class RecordingTerminalSessionGateway implements TerminalSessionGateway {
  readonly calls: TerminalSessionOpenRequest[] = [];
  readonly summaries = new Map<string, TerminalSessionSummary>();
  readonly closedSessionIds: string[] = [];

  async open(
    _context: ExecutionContext,
    request: TerminalSessionOpenRequest,
  ): Promise<Result<TerminalSessionDescriptor>> {
    this.calls.push(request);

    const descriptor: TerminalSessionDescriptor = {
      sessionId: request.sessionId,
      scope: request.scope.kind,
      serverId: request.scope.server.id,
      ...(request.scope.kind === "resource"
        ? {
            resourceId: request.scope.resource.id,
            deploymentId: request.scope.deployment.id,
          }
        : {}),
      transport: {
        kind: "websocket",
        path: `/api/terminal-sessions/${request.sessionId}/attach`,
      },
      providerKey:
        request.scope.kind === "resource"
          ? request.scope.deployment.runtimePlan.target.providerKey
          : request.scope.server.providerKey,
      ...(request.scope.kind === "resource"
        ? { workingDirectory: request.scope.workingDirectory }
        : {}),
      createdAt: "2026-04-16T00:00:00.000Z",
    };
    this.summaries.set(request.sessionId, {
      ...descriptor,
      status: "active",
    });

    return ok(descriptor);
  }

  attach(): Result<TerminalSession> {
    return err(domainError.terminalSessionNotFound("Terminal session was not found"));
  }

  list(input?: Parameters<TerminalSessionGateway["list"]>[0]): TerminalSessionSummary[] {
    return [...this.summaries.values()]
      .filter((summary) => (input?.scope ? summary.scope === input.scope : true))
      .filter((summary) => (input?.serverId ? summary.serverId === input.serverId : true))
      .filter((summary) => (input?.resourceId ? summary.resourceId === input.resourceId : true))
      .filter((summary) =>
        input?.deploymentId ? summary.deploymentId === input.deploymentId : true,
      )
      .slice(0, input?.limit ?? 50);
  }

  show(sessionId: string): Result<TerminalSessionSummary> {
    const summary = this.summaries.get(sessionId);
    return summary
      ? ok(summary)
      : err(domainError.terminalSessionNotFound("Terminal session was not found", { sessionId }));
  }

  async close(sessionId: string) {
    if (!this.summaries.has(sessionId)) {
      return err(
        domainError.terminalSessionNotFound("Terminal session was not found", { sessionId }),
      );
    }

    this.summaries.delete(sessionId);
    this.closedSessionIds.push(sessionId);
    return ok({
      sessionId,
      closed: true,
      status: "closed" as const,
    });
  }

  async expire(input?: Parameters<TerminalSessionGateway["expire"]>[0]) {
    const cutoff = input?.olderThan ? Date.parse(input.olderThan) : Date.now();
    const candidates = [...this.summaries.values()]
      .filter((summary) => Date.parse(summary.createdAt) < cutoff)
      .slice(0, input?.limit ?? 200);

    for (const summary of candidates) {
      await this.close(summary.sessionId);
    }

    return ok({
      expiredCount: candidates.length,
      sessionIds: candidates.map((summary) => summary.sessionId),
    });
  }
}

function serverSummary(overrides: Partial<ServerSummary> = {}): ServerSummary {
  return {
    id: "srv_demo",
    name: "demo",
    host: "127.0.0.1",
    port: 22,
    providerKey: "local-shell",
    targetKind: "single-server",
    lifecycleStatus: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function resourceSummary(overrides: Partial<ResourceSummary> = {}): ResourceSummary {
  return {
    id: "res_web",
    projectId: "prj_demo",
    environmentId: "env_demo",
    destinationId: "dst_demo",
    name: "web",
    slug: "web",
    kind: "application",
    services: [{ name: "web", kind: "web" }],
    deploymentCount: 1,
    lastDeploymentId: "dep_new",
    lastDeploymentStatus: "succeeded",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function deploymentSummary(overrides: Partial<DeploymentSummary> = {}): DeploymentSummary {
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
        metadata: {
          workdir: "/var/lib/appaloft/runtime/local-deployments/dep_new/source",
        },
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
    finishedAt: "2026-01-01T00:00:02.000Z",
    logCount: 0,
    ...overrides,
  };
}

function createUseCase(input?: {
  servers?: ServerSummary[];
  resources?: ResourceSummary[];
  deployments?: DeploymentSummary[];
}) {
  const gateway = new RecordingTerminalSessionGateway();
  const useCase = new OpenTerminalSessionUseCase(
    new StaticIdGenerator(),
    new StaticServerReadModel(input?.servers ?? [serverSummary()]),
    new StaticResourceReadModel(input?.resources ?? [resourceSummary()]),
    new StaticDeploymentReadModel(input?.deployments ?? [deploymentSummary()]),
    gateway,
  );

  return {
    gateway,
    useCase,
  };
}

describe("OpenTerminalSessionUseCase", () => {
  test("opens a resource session in the deployment workspace resolved from runtime metadata", async () => {
    const context = createExecutionContext({ entrypoint: "http" });
    const olderDeployment = deploymentSummary({
      id: "dep_old",
      createdAt: "2026-01-01T00:00:00.000Z",
      runtimePlan: {
        ...deploymentSummary().runtimePlan,
        execution: {
          kind: "host-process",
          metadata: {
            workdir: "/runtime/dep_old/source",
          },
        },
      },
    });
    const newerDeployment = deploymentSummary({
      id: "dep_new",
      createdAt: "2026-01-02T00:00:00.000Z",
    });
    const { gateway, useCase } = createUseCase({
      deployments: [olderDeployment, newerDeployment],
    });
    const command = OpenTerminalSessionCommand.create({
      scope: {
        kind: "resource",
        resourceId: "res_web",
      },
      relativeDirectory: "packages/api",
    })._unsafeUnwrap();

    const result = await useCase.execute(context, command);

    expect(result.isOk()).toBe(true);
    const descriptor = result._unsafeUnwrap();
    expect(descriptor).toMatchObject({
      scope: "resource",
      resourceId: "res_web",
      deploymentId: "dep_new",
      serverId: "srv_demo",
    });
    expect(gateway.calls[0]?.scope).toMatchObject({
      kind: "resource",
      workingDirectory: "/var/lib/appaloft/runtime/local-deployments/dep_new/source/packages/api",
    });
  });

  test("[TERM-SESSION-WORKSPACE-003] opens a resource session from sourceDir metadata when runtime workingDirectory is a git locator", async () => {
    const context = createExecutionContext({ entrypoint: "http" });
    const runtimePlan = deploymentSummary().runtimePlan;
    const { gateway, useCase } = createUseCase({
      deployments: [
        deploymentSummary({
          runtimePlan: {
            ...runtimePlan,
            source: {
              kind: "git-public",
              locator: "https://github.com/coollabsio/coolify-examples",
              displayName: "coolify examples",
            },
            execution: {
              kind: "docker-container",
              workingDirectory: "https://github.com/coollabsio/coolify-examples",
              metadata: {
                sourceDir: "/var/lib/appaloft/runtime/local-deployments/dep_new/source",
              },
            },
          },
        }),
      ],
    });
    const command = OpenTerminalSessionCommand.create({
      scope: {
        kind: "resource",
        resourceId: "res_web",
      },
    })._unsafeUnwrap();

    const result = await useCase.execute(context, command);

    expect(result.isOk()).toBe(true);
    expect(gateway.calls[0]?.scope).toMatchObject({
      kind: "resource",
      workingDirectory: "/var/lib/appaloft/runtime/local-deployments/dep_new/source",
    });
  });

  test("[TERM-SESSION-WORKSPACE-008] reports unavailable workspace instead of opening a session in a git locator", async () => {
    const context = createExecutionContext({ entrypoint: "http" });
    const runtimePlan = deploymentSummary().runtimePlan;
    const { gateway, useCase } = createUseCase({
      deployments: [
        deploymentSummary({
          runtimePlan: {
            ...runtimePlan,
            source: {
              kind: "git-public",
              locator: "https://github.com/coollabsio/coolify-examples",
              displayName: "coolify examples",
            },
            execution: {
              kind: "docker-container",
              workingDirectory: "https://github.com/coollabsio/coolify-examples",
            },
          },
        }),
      ],
    });
    const command = OpenTerminalSessionCommand.create({
      scope: {
        kind: "resource",
        resourceId: "res_web",
      },
    })._unsafeUnwrap();

    const result = await useCase.execute(context, command);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("terminal_session_workspace_unavailable");
    expect(gateway.calls).toHaveLength(0);
  });

  test("rejects server sessions with resource-relative directories", async () => {
    const context = createExecutionContext({ entrypoint: "http" });
    const { gateway, useCase } = createUseCase();
    const command = OpenTerminalSessionCommand.create({
      scope: {
        kind: "server",
        serverId: "srv_demo",
      },
      relativeDirectory: "app",
    })._unsafeUnwrap();

    const result = await useCase.execute(context, command);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("terminal_session_context_mismatch");
    expect(gateway.calls).toHaveLength(0);
  });

  test("rejects selected deployments that belong to another resource", async () => {
    const context = createExecutionContext({ entrypoint: "http" });
    const { gateway, useCase } = createUseCase({
      deployments: [
        deploymentSummary({
          id: "dep_other",
          resourceId: "res_other",
        }),
      ],
    });
    const command = OpenTerminalSessionCommand.create({
      scope: {
        kind: "resource",
        resourceId: "res_web",
        deploymentId: "dep_other",
      },
    })._unsafeUnwrap();

    const result = await useCase.execute(context, command);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("terminal_session_context_mismatch");
    expect(gateway.calls).toHaveLength(0);
  });

  test("rejects URL-like or shell-fragment relative directories", () => {
    const urlResult = OpenTerminalSessionCommand.create({
      scope: {
        kind: "resource",
        resourceId: "res_web",
      },
      relativeDirectory: "https://example.com/workspace",
    });
    const shellFragmentResult = OpenTerminalSessionCommand.create({
      scope: {
        kind: "resource",
        resourceId: "res_web",
      },
      relativeDirectory: "app; rm -rf tmp",
    });

    expect(urlResult.isErr()).toBe(true);
    expect(shellFragmentResult.isErr()).toBe(true);
  });

  test("reports unavailable workspace when a resource has no deployments", async () => {
    const context = createExecutionContext({ entrypoint: "http" });
    const { useCase } = createUseCase({
      deployments: [],
    });
    const command = OpenTerminalSessionCommand.create({
      scope: {
        kind: "resource",
        resourceId: "res_web",
      },
    })._unsafeUnwrap();

    const result = await useCase.execute(context, command);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("terminal_session_workspace_unavailable");
  });

  test("[TERM-SESSION-LIFE-001] [TERM-SESSION-LIFE-002] lists and shows active sessions with safe metadata", async () => {
    const context = createExecutionContext({ entrypoint: "http" });
    const { gateway, useCase } = createUseCase();
    const lifecycle = new TerminalSessionLifecycleService(gateway);
    const openCommand = OpenTerminalSessionCommand.create({
      scope: {
        kind: "resource",
        resourceId: "res_web",
      },
    })._unsafeUnwrap();

    await useCase.execute(context, openCommand);

    const list = lifecycle.list(
      ListTerminalSessionsQuery.create({ scope: "resource" })._unsafeUnwrap(),
    );
    const show = lifecycle.show(
      ShowTerminalSessionQuery.create({ sessionId: "term_test" })._unsafeUnwrap(),
    );

    expect(list).toMatchObject({
      schemaVersion: "terminal-sessions.list/v1",
      items: [
        {
          sessionId: "term_test",
          scope: "resource",
          resourceId: "res_web",
          deploymentId: "dep_new",
          status: "active",
        },
      ],
    });
    expect(show.isOk()).toBe(true);
    expect(show._unsafeUnwrap().item).toMatchObject({
      sessionId: "term_test",
      serverId: "srv_demo",
      providerKey: "local-shell",
    });
    expect(JSON.stringify(list)).not.toContain("PRIVATE KEY");
    expect(JSON.stringify(list)).not.toContain("accessToken");
    expect(JSON.stringify(list)).not.toContain("command");
  });

  test("[TERM-SESSION-LIFE-003] [TERM-SESSION-LIFE-004] closes active sessions and rejects missing sessions", async () => {
    const context = createExecutionContext({ entrypoint: "http" });
    const { gateway, useCase } = createUseCase();
    const lifecycle = new TerminalSessionLifecycleService(gateway);
    await useCase.execute(
      context,
      OpenTerminalSessionCommand.create({
        scope: {
          kind: "server",
          serverId: "srv_demo",
        },
      })._unsafeUnwrap(),
    );

    const closed = await lifecycle.close(
      CloseTerminalSessionCommand.create({ sessionId: "term_test" })._unsafeUnwrap(),
    );
    const missing = await lifecycle.close(
      CloseTerminalSessionCommand.create({ sessionId: "ter_missing" })._unsafeUnwrap(),
    );

    expect(closed.isOk()).toBe(true);
    expect(closed._unsafeUnwrap()).toEqual({
      sessionId: "term_test",
      closed: true,
      status: "closed",
    });
    expect(gateway.closedSessionIds).toEqual(["term_test"]);
    expect(lifecycle.list(ListTerminalSessionsQuery.create()._unsafeUnwrap()).items).toEqual([]);
    expect(missing.isErr()).toBe(true);
    expect(missing._unsafeUnwrapErr().code).toBe("terminal_session_not_found");
  });

  test("[TERM-SESSION-LIFE-005] expires only sessions older than the cutoff", async () => {
    const { gateway } = createUseCase();
    const lifecycle = new TerminalSessionLifecycleService(gateway);
    gateway.summaries.set("ter_old", {
      sessionId: "ter_old",
      scope: "server",
      serverId: "srv_demo",
      transport: {
        kind: "websocket",
        path: "/api/terminal-sessions/ter_old/attach",
      },
      providerKey: "local-shell",
      createdAt: "2026-04-16T00:00:00.000Z",
      status: "active",
    });
    gateway.summaries.set("ter_new", {
      sessionId: "ter_new",
      scope: "server",
      serverId: "srv_demo",
      transport: {
        kind: "websocket",
        path: "/api/terminal-sessions/ter_new/attach",
      },
      providerKey: "local-shell",
      createdAt: "2026-04-17T00:00:00.000Z",
      status: "active",
    });

    const result = await lifecycle.expire(
      ExpireTerminalSessionsCommand.create({
        olderThan: "2026-04-16T12:00:00.000Z",
      })._unsafeUnwrap(),
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      expiredCount: 1,
      sessionIds: ["ter_old"],
    });
    expect(lifecycle.list(ListTerminalSessionsQuery.create()._unsafeUnwrap()).items).toEqual([
      expect.objectContaining({
        sessionId: "ter_new",
      }),
    ]);
  });
});
