import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeactivatedAt,
  DeactivationReason,
  DeploymentTarget,
  DeploymentTargetId,
  DeploymentTargetName,
  type DomainEvent,
  HostAddress,
  PortNumber,
  ProviderKey,
  UpsertDeploymentTargetSpec,
} from "@appaloft/core";
import {
  CapturedEventBus,
  FixedClock,
  MemoryServerRepository,
  NoopLogger,
} from "@appaloft/testkit";
import {
  createExecutionContext,
  DeactivateServerCommand,
  DeactivateServerCommandHandler,
  DeactivateServerUseCase,
  type ExecutionContext,
  toRepositoryContext,
} from "../src";

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_deactivate_server_test",
    entrypoint: "system",
  });
}

function createServer() {
  return DeploymentTarget.register({
    id: DeploymentTargetId.rehydrate("srv_primary"),
    name: DeploymentTargetName.rehydrate("Primary"),
    host: HostAddress.rehydrate("203.0.113.10"),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate("generic-ssh"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();
}

async function createHarness(input?: { inactive?: boolean }) {
  const context = createTestContext();
  const repositoryContext = toRepositoryContext(context);
  const serverRepository = new MemoryServerRepository();
  const server = createServer();

  if (input?.inactive) {
    server
      .deactivate({
        deactivatedAt: DeactivatedAt.rehydrate("2026-01-01T00:00:05.000Z"),
        reason: DeactivationReason.rehydrate("initial maintenance"),
      })
      ._unsafeUnwrap();
  }

  await serverRepository.upsert(
    repositoryContext,
    server,
    UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
  );

  const eventBus = new CapturedEventBus();
  const handler = new DeactivateServerCommandHandler(
    new DeactivateServerUseCase(
      serverRepository,
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
    serverRepository,
  };
}

function eventsByType(events: unknown[], type: string): DomainEvent[] {
  return events.filter((candidate): candidate is DomainEvent => {
    if (!candidate || typeof candidate !== "object") {
      return false;
    }

    return (candidate as { type?: unknown }).type === type;
  });
}

describe("DeactivateServerUseCase", () => {
  test("[SRV-LIFE-DEACT-001] servers.deactivate marks an active server inactive", async () => {
    const { context, eventBus, handler, serverRepository } = await createHarness();
    const command = DeactivateServerCommand.create({
      serverId: "srv_primary",
      reason: "scheduled retirement",
    });
    expect(command.isOk()).toBe(true);

    const result = await handler.handle(context, command._unsafeUnwrap());

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ id: "srv_primary" });
    const persisted = serverRepository.items.get("srv_primary")?.toState();
    expect(persisted?.lifecycleStatus.value).toBe("inactive");
    expect(persisted?.deactivatedAt?.value).toBe("2026-01-01T00:00:10.000Z");
    expect(persisted?.deactivationReason?.value).toBe("scheduled retirement");
    expect(eventsByType(eventBus.events, "server-deactivated")).toHaveLength(1);
    expect(eventsByType(eventBus.events, "server-deactivated")[0]?.payload).toMatchObject({
      serverId: "srv_primary",
      reason: "scheduled retirement",
    });
  });

  test("[SRV-LIFE-DEACT-002] servers.deactivate is idempotent for inactive servers", async () => {
    const { context, eventBus, handler, serverRepository } = await createHarness({
      inactive: true,
    });
    const command = DeactivateServerCommand.create({
      serverId: "srv_primary",
      reason: "second attempt",
    });
    expect(command.isOk()).toBe(true);

    const result = await handler.handle(context, command._unsafeUnwrap());

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ id: "srv_primary" });
    const persisted = serverRepository.items.get("srv_primary")?.toState();
    expect(persisted?.lifecycleStatus.value).toBe("inactive");
    expect(persisted?.deactivatedAt?.value).toBe("2026-01-01T00:00:05.000Z");
    expect(persisted?.deactivationReason?.value).toBe("initial maintenance");
    expect(eventsByType(eventBus.events, "server-deactivated")).toHaveLength(0);
  });

  test("[SRV-LIFE-DEACT-003] servers.deactivate returns not_found for missing servers", async () => {
    const context = createTestContext();
    const eventBus = new CapturedEventBus();
    const handler = new DeactivateServerCommandHandler(
      new DeactivateServerUseCase(
        new MemoryServerRepository(),
        new FixedClock("2026-01-01T00:00:10.000Z"),
        eventBus,
        new NoopLogger(),
      ),
    );
    const command = DeactivateServerCommand.create({
      serverId: "srv_missing",
    });
    expect(command.isOk()).toBe(true);

    const result = await handler.handle(context, command._unsafeUnwrap());

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "not_found",
      details: {
        phase: "server-admission",
        serverId: "srv_missing",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });
});
