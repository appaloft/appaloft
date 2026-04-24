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
  HostAddress,
  PortNumber,
  ProviderKey,
  ServerByIdSpec,
  TargetKindValue,
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
  createExecutionContext,
  type DeploymentLogSummary,
  type DeploymentReadModel,
  type DeploymentSummary,
  type DomainBindingReadModel,
  type DomainBindingSummary,
  type ExecutionContext,
  RenameServerCommand,
  RenameServerCommandHandler,
  RenameServerUseCase,
  ShowServerQuery,
  ShowServerQueryService,
  toRepositoryContext,
} from "../src";

function activeServerFixture(): DeploymentTarget {
  return DeploymentTarget.rehydrate({
    id: DeploymentTargetId.rehydrate("srv_primary"),
    name: DeploymentTargetName.rehydrate("Primary"),
    host: HostAddress.rehydrate("203.0.113.10"),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate("generic-ssh"),
    targetKind: TargetKindValue.rehydrate("single-server"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

function inactiveServerFixture(): DeploymentTarget {
  return DeploymentTarget.rehydrate({
    ...activeServerFixture().toState(),
    lifecycleStatus: DeploymentTargetLifecycleStatusValue.rehydrate("inactive"),
    deactivatedAt: DeactivatedAt.rehydrate("2026-01-01T00:00:05.000Z"),
  });
}

function deletedServerFixture(): DeploymentTarget {
  return DeploymentTarget.rehydrate({
    ...inactiveServerFixture().toState(),
    lifecycleStatus: DeploymentTargetLifecycleStatusValue.rehydrate("deleted"),
    deletedAt: DeletedAt.rehydrate("2026-01-01T00:00:06.000Z"),
  });
}

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

function renamedEvents(events: unknown[]): DomainEvent[] {
  return events.filter(
    (candidate): candidate is DomainEvent =>
      Boolean(candidate) &&
      typeof candidate === "object" &&
      (candidate as { type?: unknown }).type === "server-renamed",
  );
}

function createTestContext(requestId: string): ExecutionContext {
  return createExecutionContext({
    requestId,
    entrypoint: "system",
  });
}

async function createHarness(input?: { server?: DeploymentTarget }) {
  const context = createTestContext("req_rename_server_test");
  const repositoryContext = toRepositoryContext(context);
  const servers = new MemoryServerRepository();
  const eventBus = new CapturedEventBus();
  const server = input?.server ?? activeServerFixture();

  await servers.upsert(repositoryContext, server, UpsertServerSpec.fromServer(server));

  const handler = new RenameServerCommandHandler(
    new RenameServerUseCase(
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

describe("RenameServerUseCase", () => {
  test("[SRV-LIFE-RENAME-001] servers.rename renames an active server", async () => {
    const { context, eventBus, handler, repositoryContext, servers } = await createHarness();
    const command = RenameServerCommand.create({
      serverId: "srv_primary",
      name: "Primary SSH server",
    });
    expect(command.isOk()).toBe(true);

    const result = await handler.handle(context, command._unsafeUnwrap());

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ id: "srv_primary" });
    const persisted = await servers.findOne(
      repositoryContext,
      ServerByIdSpec.create(DeploymentTargetId.rehydrate("srv_primary")),
    );
    const state = persisted?.toState();
    expect(state?.id.value).toBe("srv_primary");
    expect(state?.name.value).toBe("Primary SSH server");
    expect(state?.host.value).toBe("203.0.113.10");
    expect(state?.providerKey.value).toBe("generic-ssh");
    expect(state?.lifecycleStatus.value).toBe("active");
    expect(renamedEvents(eventBus.events)).toHaveLength(1);
    expect(renamedEvents(eventBus.events)[0]?.payload).toMatchObject({
      serverId: "srv_primary",
      previousName: "Primary",
      name: "Primary SSH server",
      renamedAt: "2026-01-01T00:00:10.000Z",
    });
  });

  test("[SRV-LIFE-RENAME-002] servers.rename renames an inactive server", async () => {
    const { context, eventBus, handler, repositoryContext, servers } = await createHarness({
      server: inactiveServerFixture(),
    });
    const command = RenameServerCommand.create({
      serverId: "srv_primary",
      name: "Retired SSH server",
    });
    expect(command.isOk()).toBe(true);

    const result = await handler.handle(context, command._unsafeUnwrap());

    expect(result.isOk()).toBe(true);
    const persisted = await servers.findOne(
      repositoryContext,
      ServerByIdSpec.create(DeploymentTargetId.rehydrate("srv_primary")),
    );
    const state = persisted?.toState();
    expect(state?.name.value).toBe("Retired SSH server");
    expect(state?.lifecycleStatus.value).toBe("inactive");
    expect(state?.deactivatedAt?.value).toBe("2026-01-01T00:00:05.000Z");
    expect(renamedEvents(eventBus.events)).toHaveLength(1);
  });

  test("[SRV-LIFE-RENAME-003] servers.rename is idempotent for the same normalized name", async () => {
    const { context, eventBus, handler, repositoryContext, servers } = await createHarness();
    const command = RenameServerCommand.create({
      serverId: "srv_primary",
      name: " Primary ",
    });
    expect(command.isOk()).toBe(true);

    const result = await handler.handle(context, command._unsafeUnwrap());

    expect(result.isOk()).toBe(true);
    const persisted = await servers.findOne(
      repositoryContext,
      ServerByIdSpec.create(DeploymentTargetId.rehydrate("srv_primary")),
    );
    expect(persisted?.toState().name.value).toBe("Primary");
    expect(renamedEvents(eventBus.events)).toHaveLength(0);
  });

  test("[SRV-LIFE-RENAME-004] servers.rename returns not_found for deleted servers", async () => {
    const { context, eventBus, handler, repositoryContext, servers } = await createHarness({
      server: deletedServerFixture(),
    });
    const command = RenameServerCommand.create({
      serverId: "srv_primary",
      name: "Deleted display name",
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
    expect(persisted?.toState().name.value).toBe("Primary");
    expect(persisted?.toState().deletedAt?.value).toBe("2026-01-01T00:00:06.000Z");
    expect(renamedEvents(eventBus.events)).toHaveLength(0);
  });

  test("[SRV-LIFE-RENAME-005] list and show return the renamed server name", async () => {
    const { context, handler, repositoryContext, servers } = await createHarness();
    const command = RenameServerCommand.create({
      serverId: "srv_primary",
      name: "Primary SSH server",
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
      })._unsafeUnwrap(),
    );

    expect(listed).toMatchObject([{ id: "srv_primary", name: "Primary SSH server" }]);
    expect(shown.isOk()).toBe(true);
    expect(shown._unsafeUnwrap().server).toMatchObject({
      id: "srv_primary",
      name: "Primary SSH server",
    });
  });
});
