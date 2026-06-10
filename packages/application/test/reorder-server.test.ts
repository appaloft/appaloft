import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetDisplayOrder,
  DeploymentTargetId,
  DeploymentTargetName,
  type DomainEvent,
  HostAddress,
  PortNumber,
  ProviderKey,
  UpdatedAt,
  UpsertDeploymentTargetSpec,
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
  ListServersQuery,
  ListServersQueryService,
  ReorderServersUseCase,
  toRepositoryContext,
} from "../src";

function createServer(input: { id: string; name: string; displayOrder: number }) {
  const server = DeploymentTarget.register({
    id: DeploymentTargetId.rehydrate(input.id),
    name: DeploymentTargetName.rehydrate(input.name),
    host: HostAddress.rehydrate("203.0.113.10"),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate("generic-ssh"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();

  server
    .reorder({
      displayOrder: DeploymentTargetDisplayOrder.rehydrate(input.displayOrder),
      reorderedAt: UpdatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })
    ._unsafeUnwrap();

  return server;
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

describe("servers.reorder command", () => {
  test("[SRV-LIFE-REORDER-001] reorders servers and list returns pagination metadata", async () => {
    const context = createExecutionContext({
      requestId: "req_reorder_server_test",
      entrypoint: "system",
    });
    const repositoryContext = toRepositoryContext(context);
    const repository = new MemoryServerRepository();
    for (const server of [
      createServer({ id: "srv_alpha", name: "Alpha", displayOrder: 0 }),
      createServer({ id: "srv_beta", name: "Beta", displayOrder: 1 }),
      createServer({ id: "srv_gamma", name: "Gamma", displayOrder: 2 }),
    ]) {
      await repository.upsert(
        repositoryContext,
        server,
        UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
      );
    }
    const eventBus = new CapturedEventBus();
    const reorder = new ReorderServersUseCase(
      repository,
      new FixedClock("2026-01-01T00:00:10.000Z"),
      eventBus,
      new NoopLogger(),
    );
    const list = new ListServersQueryService(new MemoryServerReadModel(repository));

    const reorderResult = await reorder.execute(context, {
      serverIds: ["srv_gamma", "srv_alpha", "srv_beta"],
    });
    const listResult = await list.execute(
      context,
      ListServersQuery.create({ limit: 2, offset: 1 })._unsafeUnwrap(),
    );

    expect(reorderResult.isOk()).toBe(true);
    expect(reorderResult._unsafeUnwrap()).toEqual({
      reorderedServerIds: ["srv_gamma", "srv_alpha", "srv_beta"],
    });
    expect(listResult).toMatchObject({
      total: 3,
      limit: 2,
      offset: 1,
    });
    expect(listResult.items.map((server) => server.id)).toEqual(["srv_alpha", "srv_beta"]);
    expect(eventByType(eventBus.events, "server-reordered").payload).toMatchObject({
      serverId: "srv_gamma",
      previousDisplayOrder: 2,
      nextDisplayOrder: 0,
    });
  });

  test("[SRV-LIFE-REORDER-002] rejects duplicate server ids", async () => {
    const context = createExecutionContext({
      requestId: "req_reorder_server_duplicate_test",
      entrypoint: "system",
    });
    const reorder = new ReorderServersUseCase(
      new MemoryServerRepository(),
      new FixedClock("2026-01-01T00:00:10.000Z"),
      new CapturedEventBus(),
      new NoopLogger(),
    );

    const result = await reorder.execute(context, {
      serverIds: ["srv_demo", "srv_demo"],
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
    });
  });
});
