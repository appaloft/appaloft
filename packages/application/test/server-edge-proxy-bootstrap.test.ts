import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { type DeploymentTargetState, type DomainEvent, ok } from "@appaloft/core";
import {
  CapturedEventBus,
  FixedClock,
  MemoryServerRepository,
  NoopLogger,
  SequenceIdGenerator,
} from "@appaloft/testkit";
import { createExecutionContext, type ExecutionContext } from "../src/execution-context";
import {
  type ServerEdgeProxyBootstrapper,
  type ServerEdgeProxyBootstrapResult,
} from "../src/ports";
import { BootstrapServerEdgeProxyOnTargetRegisteredHandler } from "../src/server-handlers";
import { RegisterServerUseCase } from "../src/use-cases";

class StaticProxyBootstrapper implements ServerEdgeProxyBootstrapper {
  constructor(private readonly status: ServerEdgeProxyBootstrapResult["status"]) {}

  async bootstrap(
    context: ExecutionContext,
    input: {
      server: DeploymentTargetState;
    },
  ) {
    void context;
    const { server } = input;

    return ok({
      serverId: server.id.value,
      kind: server.edgeProxy?.kind.value ?? "traefik",
      status: this.status,
      attemptedAt: "2026-01-01T00:00:01.000Z",
      message:
        this.status === "ready"
          ? "Traefik edge proxy is ready"
          : "Traefik edge proxy failed to start",
      ...(this.status === "failed" ? { errorCode: "edge_proxy_start_failed" } : {}),
    });
  }
}

function createTestContext(): ExecutionContext {
  return createExecutionContext({
    requestId: "req_test",
    entrypoint: "system",
  });
}

function registeredEvent(events: unknown[]): DomainEvent {
  const event = events.find((candidate): candidate is DomainEvent => {
    if (!candidate || typeof candidate !== "object") {
      return false;
    }

    return (candidate as { type?: unknown }).type === "deployment_target.registered";
  });

  if (!event) {
    throw new Error("deployment_target.registered event was not captured");
  }

  return event;
}

describe("BootstrapServerEdgeProxyOnTargetRegisteredHandler", () => {
  test("bootstraps the server edge proxy after server metadata is persisted", async () => {
    const serverRepository = new MemoryServerRepository();
    const clock = new FixedClock("2026-01-01T00:00:00.000Z");
    const eventBus = new CapturedEventBus();
    const logger = new NoopLogger();
    const context = createTestContext();
    const registerServer = new RegisterServerUseCase(
      serverRepository,
      clock,
      new SequenceIdGenerator(),
      eventBus,
      logger,
    );

    const created = await registerServer.execute(context, {
      name: "demo",
      host: "127.0.0.1",
      providerKey: "local-shell",
    });

    expect(created.isOk()).toBe(true);
    const serverId = created._unsafeUnwrap().id;
    const persistedBeforeEvent = serverRepository.items.get(serverId)?.toState();
    expect(persistedBeforeEvent?.edgeProxy?.kind.value).toBe("traefik");
    expect(persistedBeforeEvent?.edgeProxy?.status.value).toBe("pending");

    const handler = new BootstrapServerEdgeProxyOnTargetRegisteredHandler(
      serverRepository,
      new StaticProxyBootstrapper("ready"),
      clock,
      logger,
    );
    const handled = await handler.handle(context, registeredEvent(eventBus.events));

    expect(handled.isOk()).toBe(true);
    const persistedAfterEvent = serverRepository.items.get(serverId)?.toState();
    expect(persistedAfterEvent?.edgeProxy?.status.value).toBe("ready");
    expect(persistedAfterEvent?.edgeProxy?.lastSucceededAt?.value).toBe(clock.now());
  });

  test("records proxy bootstrap failure without removing server metadata", async () => {
    const serverRepository = new MemoryServerRepository();
    const clock = new FixedClock("2026-01-01T00:00:00.000Z");
    const eventBus = new CapturedEventBus();
    const logger = new NoopLogger();
    const context = createTestContext();
    const registerServer = new RegisterServerUseCase(
      serverRepository,
      clock,
      new SequenceIdGenerator(),
      eventBus,
      logger,
    );

    const created = await registerServer.execute(context, {
      name: "demo",
      host: "127.0.0.1",
      providerKey: "local-shell",
    });

    expect(created.isOk()).toBe(true);
    const serverId = created._unsafeUnwrap().id;
    const handler = new BootstrapServerEdgeProxyOnTargetRegisteredHandler(
      serverRepository,
      new StaticProxyBootstrapper("failed"),
      clock,
      logger,
    );
    const handled = await handler.handle(context, registeredEvent(eventBus.events));

    expect(handled.isOk()).toBe(true);
    const persistedAfterEvent = serverRepository.items.get(serverId)?.toState();
    expect(persistedAfterEvent?.id.value).toBe(serverId);
    expect(persistedAfterEvent?.edgeProxy?.status.value).toBe("failed");
    expect(persistedAfterEvent?.edgeProxy?.lastErrorCode?.value).toBe("edge_proxy_start_failed");
  });
});
