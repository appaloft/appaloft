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
import { BootstrapServerProxyUseCase, RegisterServerUseCase } from "../src/use-cases";

class RecordingProxyBootstrapper implements ServerEdgeProxyBootstrapper {
  readonly calls: DeploymentTargetState[] = [];
  private nextStatusIndex = 0;

  constructor(private readonly statuses: ServerEdgeProxyBootstrapResult["status"][]) {}

  async bootstrap(
    context: ExecutionContext,
    input: {
      server: DeploymentTargetState;
    },
  ) {
    void context;
    const { server } = input;
    this.calls.push(server);
    const status = this.statuses[this.nextStatusIndex] ?? this.statuses.at(-1) ?? "ready";
    this.nextStatusIndex += 1;

    return ok({
      serverId: server.id.value,
      kind: server.edgeProxy?.kind.value ?? "traefik",
      status,
      attemptedAt: "2026-01-01T00:00:01.000Z",
      message:
        status === "ready" ? "Traefik edge proxy is ready" : "Traefik edge proxy failed to start",
      ...(status === "failed" ? { errorCode: "edge_proxy_start_failed" } : {}),
      metadata: {
        image: "traefik:v3.6.2",
      },
    });
  }
}

function createTestContext(
  entrypoint: ExecutionContext["entrypoint"] = "system",
): ExecutionContext {
  return createExecutionContext({
    requestId: "req_test",
    entrypoint,
  });
}

async function createRegisteredServer(input?: { proxyKind?: "none" | "traefik" | "caddy" }) {
  const serverRepository = new MemoryServerRepository();
  const clock = new FixedClock("2026-01-01T00:00:00.000Z");
  const eventBus = new CapturedEventBus();
  const logger = new NoopLogger();
  const idGenerator = new SequenceIdGenerator();
  const context = createTestContext();
  const registerServerUseCase = new RegisterServerUseCase(
    serverRepository,
    clock,
    idGenerator,
    eventBus,
    logger,
  );

  const created = await registerServerUseCase.execute(context, {
    name: "demo",
    host: "127.0.0.1",
    providerKey: "local-shell",
    ...(input?.proxyKind ? { proxyKind: input.proxyKind } : {}),
  });

  expect(created.isOk()).toBe(true);

  return {
    clock,
    eventBus,
    idGenerator,
    logger,
    serverId: created._unsafeUnwrap().id,
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

describe("BootstrapServerProxyUseCase", () => {
  test("repairs a provider-backed proxy through a new bootstrap attempt", async () => {
    const { clock, eventBus, idGenerator, logger, serverId, serverRepository } =
      await createRegisteredServer();
    const bootstrapper = new RecordingProxyBootstrapper(["ready"]);
    const useCase = new BootstrapServerProxyUseCase(
      serverRepository,
      bootstrapper,
      clock,
      idGenerator,
      eventBus,
      logger,
    );

    clock.set("2026-01-01T00:00:01.000Z");
    const result = await useCase.execute(createTestContext(), {
      serverId,
      reason: "repair",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      serverId,
      attemptId: "pxy_0002",
    });
    expect(bootstrapper.calls).toHaveLength(1);
    expect(bootstrapper.calls[0]?.edgeProxy?.status.value).toBe("starting");

    const requested = eventsByType(eventBus.events, "proxy-bootstrap-requested");
    const installed = eventsByType(eventBus.events, "proxy-installed");

    expect(requested).toHaveLength(1);
    expect(requested[0]?.payload).toMatchObject({
      serverId,
      attemptId: "pxy_0002",
      edgeProxyProviderKey: "traefik",
      providerKey: "traefik",
      reason: "repair",
    });
    expect(installed).toHaveLength(1);
    expect(installed[0]?.payload).toMatchObject({
      serverId,
      attemptId: "pxy_0002",
      edgeProxyProviderKey: "traefik",
    });

    const persisted = serverRepository.items.get(serverId)?.toState();
    expect(persisted?.edgeProxy?.status.value).toBe("ready");
    expect(persisted?.edgeProxy?.lastAttemptAt?.value).toBe("2026-01-01T00:00:01.000Z");
    expect(persisted?.edgeProxy?.lastSucceededAt?.value).toBe("2026-01-01T00:00:01.000Z");
  });

  test("creates a new attempt for each retry instead of replaying the previous event", async () => {
    const { clock, eventBus, idGenerator, logger, serverId, serverRepository } =
      await createRegisteredServer();
    const bootstrapper = new RecordingProxyBootstrapper(["failed", "failed"]);
    const useCase = new BootstrapServerProxyUseCase(
      serverRepository,
      bootstrapper,
      clock,
      idGenerator,
      eventBus,
      logger,
    );

    clock.set("2026-01-01T00:00:01.000Z");
    const first = await useCase.execute(createTestContext(), {
      serverId,
      reason: "repair",
    });
    clock.set("2026-01-01T00:00:02.000Z");
    const second = await useCase.execute(createTestContext(), {
      serverId,
      reason: "retry",
    });

    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
    expect(first._unsafeUnwrap().attemptId).toBe("pxy_0002");
    expect(second._unsafeUnwrap().attemptId).toBe("pxy_0003");

    const requested = eventsByType(eventBus.events, "proxy-bootstrap-requested");
    const failed = eventsByType(eventBus.events, "proxy-install-failed");

    expect(requested.map((event) => event.payload.attemptId)).toEqual(["pxy_0002", "pxy_0003"]);
    expect(failed.map((event) => event.payload.attemptId)).toEqual(["pxy_0002", "pxy_0003"]);
    expect(failed[0]?.payload).toMatchObject({
      errorCode: "edge_proxy_start_failed",
      failurePhase: "proxy-container",
      retriable: true,
    });

    const persisted = serverRepository.items.get(serverId)?.toState();
    expect(persisted?.edgeProxy?.status.value).toBe("failed");
    expect(persisted?.edgeProxy?.lastErrorCode?.value).toBe("edge_proxy_start_failed");
  });

  test("rejects public repair requests that provide their own attempt id", async () => {
    const { clock, eventBus, idGenerator, logger, serverId, serverRepository } =
      await createRegisteredServer();
    const bootstrapper = new RecordingProxyBootstrapper(["ready"]);
    const useCase = new BootstrapServerProxyUseCase(
      serverRepository,
      bootstrapper,
      clock,
      idGenerator,
      eventBus,
      logger,
    );

    const result = await useCase.execute(createTestContext("cli"), {
      serverId,
      attemptId: "pxy_manual",
      reason: "repair",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("validation_error");
    expect(bootstrapper.calls).toHaveLength(0);
    expect(eventsByType(eventBus.events, "proxy-bootstrap-requested")).toHaveLength(0);
  });

  test("rejects repair for disabled edge proxy targets", async () => {
    const { clock, eventBus, idGenerator, logger, serverId, serverRepository } =
      await createRegisteredServer({ proxyKind: "none" });
    const bootstrapper = new RecordingProxyBootstrapper(["ready"]);
    const useCase = new BootstrapServerProxyUseCase(
      serverRepository,
      bootstrapper,
      clock,
      idGenerator,
      eventBus,
      logger,
    );

    const result = await useCase.execute(createTestContext(), {
      serverId,
      reason: "repair",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("invariant_violation");
    expect(bootstrapper.calls).toHaveLength(0);
    expect(eventsByType(eventBus.events, "proxy-bootstrap-requested")).toHaveLength(0);
  });
});
