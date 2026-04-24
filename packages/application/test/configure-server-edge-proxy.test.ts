import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeactivatedAt,
  DeletedAt,
  DeploymentTarget,
  DeploymentTargetId,
  DeploymentTargetLifecycleStatusValue,
  DeploymentTargetName,
  type DomainEvent,
  EdgeProxyKindValue,
  EdgeProxyStatusValue,
  ErrorCodeText,
  HostAddress,
  MessageText,
  PortNumber,
  ProviderKey,
  ServerByIdSpec,
  TargetKindValue,
  UpdatedAt,
  UpsertServerSpec,
} from "@appaloft/core";
import {
  CapturedEventBus,
  FixedClock,
  MemoryServerReadModel,
  MemoryServerRepository,
  NoopLogger,
} from "@appaloft/testkit";

import {
  ConfigureServerEdgeProxyCommand,
  ConfigureServerEdgeProxyCommandHandler,
  ConfigureServerEdgeProxyUseCase,
  createExecutionContext,
  type DeploymentLogSummary,
  type DeploymentReadModel,
  type DeploymentSummary,
  type DomainBindingReadModel,
  type DomainBindingSummary,
  type ExecutionContext,
  ShowServerQuery,
  ShowServerQueryService,
  toRepositoryContext,
} from "../src";

class EmptyDeploymentReadModel implements DeploymentReadModel {
  async list(): Promise<DeploymentSummary[]> {
    return [];
  }

  async findOne(): Promise<DeploymentSummary | null> {
    return null;
  }

  async findLogs(): Promise<DeploymentLogSummary[]> {
    return [];
  }
}

class EmptyDomainBindingReadModel implements DomainBindingReadModel {
  async list(): Promise<DomainBindingSummary[]> {
    return [];
  }
}

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_configure_server_edge_proxy_test",
    entrypoint: "system",
  });
}

function eventsByType(events: unknown[], type: string): DomainEvent[] {
  return events.filter((candidate): candidate is DomainEvent => {
    if (!candidate || typeof candidate !== "object") {
      return false;
    }

    return (candidate as { type?: unknown }).type === type;
  });
}

function serverFixture(input?: {
  lifecycleStatus?: "active" | "inactive" | "deleted";
  proxyKind?: "none" | "traefik" | "caddy";
  proxyStatus?: "pending" | "starting" | "ready" | "failed" | "disabled";
  withProxyError?: boolean;
}): DeploymentTarget {
  const lifecycleStatus = input?.lifecycleStatus ?? "active";
  const proxyKind = input?.proxyKind ?? "traefik";
  const proxyStatus = input?.proxyStatus ?? "ready";

  return DeploymentTarget.rehydrate({
    id: DeploymentTargetId.rehydrate("srv_primary"),
    name: DeploymentTargetName.rehydrate("Primary"),
    host: HostAddress.rehydrate("203.0.113.10"),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate("generic-ssh"),
    targetKind: TargetKindValue.rehydrate("single-server"),
    lifecycleStatus: DeploymentTargetLifecycleStatusValue.rehydrate(lifecycleStatus),
    ...(lifecycleStatus === "inactive" || lifecycleStatus === "deleted"
      ? { deactivatedAt: DeactivatedAt.rehydrate("2026-01-01T00:00:05.000Z") }
      : {}),
    ...(lifecycleStatus === "deleted"
      ? { deletedAt: DeletedAt.rehydrate("2026-01-01T00:00:06.000Z") }
      : {}),
    edgeProxy: {
      kind: EdgeProxyKindValue.rehydrate(proxyKind),
      status: EdgeProxyStatusValue.rehydrate(proxyStatus),
      ...(input?.withProxyError
        ? {
            lastAttemptAt: UpdatedAt.rehydrate("2026-01-01T00:00:07.000Z"),
            lastErrorCode: ErrorCodeText.rehydrate("edge_proxy_start_failed"),
            lastErrorMessage: MessageText.rehydrate("Previous proxy failed"),
          }
        : {}),
    },
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

async function createHarness(input?: { server?: DeploymentTarget }) {
  const context = createTestContext();
  const repositoryContext = toRepositoryContext(context);
  const servers = new MemoryServerRepository();
  const eventBus = new CapturedEventBus();
  const server = input?.server ?? serverFixture();

  await servers.upsert(repositoryContext, server, UpsertServerSpec.fromServer(server));

  const handler = new ConfigureServerEdgeProxyCommandHandler(
    new ConfigureServerEdgeProxyUseCase(
      servers,
      new FixedClock("2026-01-01T00:00:10.000Z"),
      eventBus,
      new NoopLogger(),
    ),
  );

  return {
    context,
    eventBus,
    handler,
    repositoryContext,
    servers,
  };
}

describe("ConfigureServerEdgeProxyUseCase", () => {
  test("[SRV-LIFE-PROXY-CONFIG-001] active server can change from provider-backed proxy to none", async () => {
    const { context, eventBus, handler, repositoryContext, servers } = await createHarness();
    const command = ConfigureServerEdgeProxyCommand.create({
      serverId: "srv_primary",
      proxyKind: "none",
    });
    expect(command.isOk()).toBe(true);

    const result = await handler.handle(context, command._unsafeUnwrap());

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      id: "srv_primary",
      edgeProxy: {
        kind: "none",
        status: "disabled",
      },
    });
    const persisted = await servers.findOne(
      repositoryContext,
      ServerByIdSpec.create(DeploymentTargetId.rehydrate("srv_primary")),
    );
    const state = persisted?.toState();
    expect(state?.id.value).toBe("srv_primary");
    expect(state?.host.value).toBe("203.0.113.10");
    expect(state?.providerKey.value).toBe("generic-ssh");
    expect(state?.lifecycleStatus.value).toBe("active");
    expect(state?.edgeProxy?.kind.value).toBe("none");
    expect(state?.edgeProxy?.status.value).toBe("disabled");
    expect(eventsByType(eventBus.events, "server-edge-proxy-configured")).toHaveLength(1);
    expect(eventsByType(eventBus.events, "server-edge-proxy-configured")[0]?.payload).toMatchObject(
      {
        serverId: "srv_primary",
        previousKind: "traefik",
        previousStatus: "ready",
        kind: "none",
        status: "disabled",
        configuredAt: "2026-01-01T00:00:10.000Z",
      },
    );
  });

  test("[SRV-LIFE-PROXY-CONFIG-002] active server can change from none to provider-backed proxy without bootstrap side effects", async () => {
    const { context, eventBus, handler, repositoryContext, servers } = await createHarness({
      server: serverFixture({ proxyKind: "none", proxyStatus: "disabled" }),
    });
    const command = ConfigureServerEdgeProxyCommand.create({
      serverId: "srv_primary",
      proxyKind: "caddy",
    });
    expect(command.isOk()).toBe(true);

    const result = await handler.handle(context, command._unsafeUnwrap());

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      id: "srv_primary",
      edgeProxy: {
        kind: "caddy",
        status: "pending",
      },
    });
    const persisted = await servers.findOne(
      repositoryContext,
      ServerByIdSpec.create(DeploymentTargetId.rehydrate("srv_primary")),
    );
    expect(persisted?.toState().edgeProxy?.kind.value).toBe("caddy");
    expect(persisted?.toState().edgeProxy?.status.value).toBe("pending");
    expect(eventsByType(eventBus.events, "server-edge-proxy-configured")).toHaveLength(1);
    expect(eventsByType(eventBus.events, "proxy-bootstrap-requested")).toHaveLength(0);
  });

  test("[SRV-LIFE-PROXY-CONFIG-003] active server can change provider-backed proxy kind and clears stale error summary", async () => {
    const { context, eventBus, handler, repositoryContext, servers } = await createHarness({
      server: serverFixture({
        proxyKind: "traefik",
        proxyStatus: "failed",
        withProxyError: true,
      }),
    });
    const command = ConfigureServerEdgeProxyCommand.create({
      serverId: "srv_primary",
      proxyKind: "caddy",
    });
    expect(command.isOk()).toBe(true);

    const result = await handler.handle(context, command._unsafeUnwrap());

    expect(result.isOk()).toBe(true);
    const persisted = await servers.findOne(
      repositoryContext,
      ServerByIdSpec.create(DeploymentTargetId.rehydrate("srv_primary")),
    );
    const edgeProxy = persisted?.toState().edgeProxy;
    expect(edgeProxy?.kind.value).toBe("caddy");
    expect(edgeProxy?.status.value).toBe("pending");
    expect(edgeProxy?.lastAttemptAt).toBeUndefined();
    expect(edgeProxy?.lastErrorCode).toBeUndefined();
    expect(edgeProxy?.lastErrorMessage).toBeUndefined();
    expect(eventsByType(eventBus.events, "server-edge-proxy-configured")).toHaveLength(1);
  });

  test("[SRV-LIFE-PROXY-CONFIG-004] same proxy kind configure is idempotent and preserves status", async () => {
    const { context, eventBus, handler, repositoryContext, servers } = await createHarness();
    const command = ConfigureServerEdgeProxyCommand.create({
      serverId: "srv_primary",
      proxyKind: "traefik",
    });
    expect(command.isOk()).toBe(true);

    const result = await handler.handle(context, command._unsafeUnwrap());

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      id: "srv_primary",
      edgeProxy: {
        kind: "traefik",
        status: "ready",
      },
    });
    const persisted = await servers.findOne(
      repositoryContext,
      ServerByIdSpec.create(DeploymentTargetId.rehydrate("srv_primary")),
    );
    expect(persisted?.toState().edgeProxy?.status.value).toBe("ready");
    expect(eventsByType(eventBus.events, "server-edge-proxy-configured")).toHaveLength(0);
  });

  test("[SRV-LIFE-PROXY-CONFIG-005] inactive server rejects ordinary edge proxy configuration", async () => {
    const { context, eventBus, handler, repositoryContext, servers } = await createHarness({
      server: serverFixture({ lifecycleStatus: "inactive" }),
    });
    const command = ConfigureServerEdgeProxyCommand.create({
      serverId: "srv_primary",
      proxyKind: "none",
    });
    expect(command.isOk()).toBe(true);

    const result = await handler.handle(context, command._unsafeUnwrap());

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "server_inactive",
      details: {
        commandName: "servers.configure-edge-proxy",
        phase: "server-lifecycle-guard",
        serverId: "srv_primary",
      },
    });
    const persisted = await servers.findOne(
      repositoryContext,
      ServerByIdSpec.create(DeploymentTargetId.rehydrate("srv_primary")),
    );
    expect(persisted?.toState().edgeProxy?.kind.value).toBe("traefik");
    expect(eventsByType(eventBus.events, "server-edge-proxy-configured")).toHaveLength(0);
  });

  test("[SRV-LIFE-PROXY-CONFIG-006] deleted server tombstone is not configurable", async () => {
    const { context, eventBus, handler, repositoryContext, servers } = await createHarness({
      server: serverFixture({ lifecycleStatus: "deleted" }),
    });
    const command = ConfigureServerEdgeProxyCommand.create({
      serverId: "srv_primary",
      proxyKind: "none",
    });
    expect(command.isOk()).toBe(true);

    const result = await handler.handle(context, command._unsafeUnwrap());

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "not_found",
      details: {
        phase: "server-admission",
        serverId: "srv_primary",
      },
    });
    const persisted = await servers.findOne(
      repositoryContext,
      ServerByIdSpec.create(DeploymentTargetId.rehydrate("srv_primary")),
    );
    expect(persisted?.toState().edgeProxy?.kind.value).toBe("traefik");
    expect(eventsByType(eventBus.events, "server-edge-proxy-configured")).toHaveLength(0);
  });

  test("[SRV-LIFE-PROXY-CONFIG-007] list and show return configured edge proxy state", async () => {
    const { context, handler, repositoryContext, servers } = await createHarness({
      server: serverFixture({ proxyKind: "none", proxyStatus: "disabled" }),
    });
    const command = ConfigureServerEdgeProxyCommand.create({
      serverId: "srv_primary",
      proxyKind: "caddy",
    });
    expect(command.isOk()).toBe(true);

    const result = await handler.handle(context, command._unsafeUnwrap());
    expect(result.isOk()).toBe(true);

    const readModel = new MemoryServerReadModel(servers);
    const listed = await readModel.list(repositoryContext);
    const shown = await new ShowServerQueryService(
      readModel,
      new EmptyDeploymentReadModel(),
      new EmptyDomainBindingReadModel(),
      new FixedClock("2026-01-01T00:00:10.000Z"),
    ).execute(
      context,
      ShowServerQuery.create({
        serverId: "srv_primary",
        includeRollups: false,
      })._unsafeUnwrap(),
    );

    expect(listed).toHaveLength(1);
    expect(listed[0]?.edgeProxy).toEqual({
      kind: "caddy",
      status: "pending",
    });
    expect(shown.isOk()).toBe(true);
    expect(shown._unsafeUnwrap().server.edgeProxy).toEqual({
      kind: "caddy",
      status: "pending",
    });
  });
});
