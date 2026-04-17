import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { type DomainEvent } from "@appaloft/core";
import {
  CapturedEventBus,
  FixedClock,
  MemoryServerRepository,
  NoopLogger,
  SequenceIdGenerator,
} from "@appaloft/testkit";
import {
  createExecutionContext,
  type ExecutionContext,
  RegisterServerCommand,
  RegisterServerCommandHandler,
  RegisterServerUseCase,
} from "../src";

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_test",
    entrypoint: "system",
  });
}

function createHarness() {
  const serverRepository = new MemoryServerRepository();
  const clock = new FixedClock("2026-01-01T00:00:00.000Z");
  const eventBus = new CapturedEventBus();
  const logger = new NoopLogger();
  const handler = new RegisterServerCommandHandler(
    new RegisterServerUseCase(serverRepository, clock, new SequenceIdGenerator(), eventBus, logger),
  );

  return {
    eventBus,
    handler,
    serverRepository,
  };
}

function eventByType(events: unknown[], type: string): DomainEvent {
  const event = events.find((candidate): candidate is DomainEvent => {
    if (!candidate || typeof candidate !== "object") {
      return false;
    }

    return (candidate as { type?: unknown }).type === type;
  });

  if (!event) {
    throw new Error(`${type} event was not captured`);
  }

  return event;
}

describe("servers.register command", () => {
  test("[SERVER-BOOT-CMD-001] servers.register command persists provider-backed server metadata", async () => {
    const { eventBus, handler, serverRepository } = createHarness();
    const command = RegisterServerCommand.create({
      name: "Provider target",
      host: "127.0.0.1",
      providerKey: "local-shell",
    });
    expect(command.isOk()).toBe(true);

    const result = await handler.handle(createTestContext(), command._unsafeUnwrap());
    expect(result.isOk()).toBe(true);

    const serverId = result._unsafeUnwrap().id;
    const persisted = serverRepository.items.get(serverId)?.toState();
    expect(persisted?.id.value).toBe(serverId);
    expect(persisted?.name.value).toBe("Provider target");
    expect(persisted?.host.value).toBe("127.0.0.1");
    expect(persisted?.port.value).toBe(22);
    expect(persisted?.providerKey.value).toBe("local-shell");
    expect(persisted?.edgeProxy?.kind.value).toBe("traefik");
    expect(persisted?.edgeProxy?.status.value).toBe("pending");

    expect(eventByType(eventBus.events, "deployment_target.registered").payload).toMatchObject({
      providerKey: "local-shell",
    });
  });

  test("[SERVER-BOOT-CMD-002] servers.register command persists disabled proxy server metadata", async () => {
    const { eventBus, handler, serverRepository } = createHarness();
    const command = RegisterServerCommand.create({
      name: "No proxy target",
      host: "127.0.0.1",
      providerKey: "local-shell",
      proxyKind: "none",
    });
    expect(command.isOk()).toBe(true);

    const result = await handler.handle(createTestContext(), command._unsafeUnwrap());
    expect(result.isOk()).toBe(true);

    const serverId = result._unsafeUnwrap().id;
    const persisted = serverRepository.items.get(serverId)?.toState();
    expect(persisted?.id.value).toBe(serverId);
    expect(persisted?.edgeProxy?.kind.value).toBe("none");
    expect(persisted?.edgeProxy?.status.value).toBe("disabled");
    expect(eventByType(eventBus.events, "deployment_target.registered").payload).toMatchObject({
      providerKey: "local-shell",
    });
  });

  test("[SERVER-BOOT-CMD-003] servers.register command rejects invalid input", () => {
    const command = RegisterServerCommand.create({
      name: "",
      host: "",
      providerKey: "",
    });

    expect(command.isErr()).toBe(true);
    expect(command._unsafeUnwrapErr().code).toBe("validation_error");
  });
});
