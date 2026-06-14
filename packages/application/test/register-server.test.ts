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
  type OperationCheckRequest,
  type OperationGuardDecision,
  type OperationGuardPort,
  RegisterServerCommand,
  RegisterServerCommandHandler,
  RegisterServerUseCase,
} from "../src";

class DenyingOperationGuardPort implements OperationGuardPort {
  readonly requests: OperationCheckRequest[] = [];

  async checkOperation(
    _context: ExecutionContext,
    request: OperationCheckRequest,
  ): Promise<OperationGuardDecision> {
    this.requests.push(request);
    return {
      allowed: false,
      checks: [
        {
          allowed: false,
          checkKey: "test.server-target",
          kind: "validation",
          reason: "test-server-target-denied",
        },
      ],
      deniedBy: {
        checkKey: "test.server-target",
        kind: "validation",
      },
      reason: "test-server-target-denied",
      details: {
        host: "127.0.0.1",
        providerKey: "local-shell",
      },
    };
  }
}

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_test",
    entrypoint: "system",
  });
}

function createHarness(input: { operationGuardPort?: OperationGuardPort } = {}) {
  const serverRepository = new MemoryServerRepository();
  const clock = new FixedClock("2026-01-01T00:00:00.000Z");
  const eventBus = new CapturedEventBus();
  const logger = new NoopLogger();
  const handler = new RegisterServerCommandHandler(
    new RegisterServerUseCase(
      serverRepository,
      clock,
      new SequenceIdGenerator(),
      eventBus,
      logger,
      input.operationGuardPort,
    ),
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
    expect(persisted?.targetKind.value).toBe("single-server");
    expect(persisted?.edgeProxy?.kind.value).toBe("traefik");
    expect(persisted?.edgeProxy?.status.value).toBe("pending");

    expect(eventByType(eventBus.events, "deployment_target.registered").payload).toMatchObject({
      providerKey: "local-shell",
      targetKind: "single-server",
    });
  });

  test("[SWARM-TARGET-REG-001] servers.register persists Swarm manager target kind metadata", async () => {
    const { eventBus, handler, serverRepository } = createHarness();
    const command = RegisterServerCommand.create({
      name: "Swarm manager",
      host: "swarm-manager.internal",
      providerKey: "docker-swarm",
      targetKind: "orchestrator-cluster",
      proxyKind: "none",
    });
    expect(command.isOk()).toBe(true);

    const result = await handler.handle(createTestContext(), command._unsafeUnwrap());
    expect(result.isOk()).toBe(true);

    const serverId = result._unsafeUnwrap().id;
    const persisted = serverRepository.items.get(serverId)?.toState();
    expect(persisted?.providerKey.value).toBe("docker-swarm");
    expect(persisted?.targetKind.value).toBe("orchestrator-cluster");
    expect(persisted?.edgeProxy?.kind.value).toBe("none");
    expect(persisted?.edgeProxy?.status.value).toBe("disabled");

    expect(eventByType(eventBus.events, "deployment_target.registered").payload).toMatchObject({
      providerKey: "docker-swarm",
      targetKind: "orchestrator-cluster",
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
      targetKind: "single-server",
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

  test("[SERVER-BOOT-CMD-004] servers.register applies operation guard before persistence", async () => {
    const operationGuardPort = new DenyingOperationGuardPort();
    const { eventBus, handler, serverRepository } = createHarness({ operationGuardPort });
    const command = RegisterServerCommand.create({
      name: "Blocked local target",
      host: "127.0.0.1",
      providerKey: "local-shell",
    });
    expect(command.isOk()).toBe(true);

    const result = await handler.handle(createTestContext(), command._unsafeUnwrap());
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "operation_check_denied",
      details: {
        operationKey: "servers.register",
        reason: "test-server-target-denied",
        host: "127.0.0.1",
        providerKey: "local-shell",
      },
    });
    expect(operationGuardPort.requests).toHaveLength(1);
    expect(operationGuardPort.requests[0]).toMatchObject({
      operationKey: "servers.register",
      contextAttributes: {
        host: "127.0.0.1",
        providerKey: "local-shell",
        targetKind: "single-server",
      },
    });
    expect(serverRepository.items.size).toBe(0);
    expect(eventBus.events).toEqual([]);
  });
});
