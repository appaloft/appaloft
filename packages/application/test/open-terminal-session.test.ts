import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { domainError, err, ok, type Result } from "@appaloft/core";

import { createExecutionContext, type ExecutionContext, type RepositoryContext } from "../src";
import { OpenTerminalSessionCommand } from "../src/messages";
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
} from "../src/ports";
import { OpenTerminalSessionUseCase } from "../src/use-cases";

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

  async findLogs(): Promise<DeploymentLogSummary[]> {
    return [];
  }
}

class RecordingTerminalSessionGateway implements TerminalSessionGateway {
  readonly calls: TerminalSessionOpenRequest[] = [];

  async open(
    _context: ExecutionContext,
    request: TerminalSessionOpenRequest,
  ): Promise<Result<TerminalSessionDescriptor>> {
    this.calls.push(request);

    return ok({
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
    });
  }

  attach(): Result<TerminalSession> {
    return err(domainError.terminalSessionNotFound("Terminal session was not found"));
  }
}

function serverSummary(overrides: Partial<ServerSummary> = {}): ServerSummary {
  return {
    id: "srv_demo",
    name: "demo",
    host: "127.0.0.1",
    port: 22,
    providerKey: "local-shell",
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
});
