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
  ok,
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
  type ServerDeletionBlocker,
  type ServerDeletionBlockerReader,
  toRepositoryContext,
} from "../src";
import { DeleteServerCommand, ShowServerQuery } from "../src/messages";
import { DeleteServerUseCase, ShowServerQueryService } from "../src/use-cases";

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

class FixedServerDeletionBlockerReader implements ServerDeletionBlockerReader {
  public calls = 0;

  constructor(private readonly blockers: ServerDeletionBlocker[] = []) {}

  async findBlockers() {
    this.calls += 1;
    return ok(this.blockers);
  }
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

function deletedEvent(events: unknown[]): DomainEvent {
  const event = events.find(
    (candidate): candidate is DomainEvent =>
      Boolean(candidate) &&
      typeof candidate === "object" &&
      (candidate as { type?: unknown }).type === "server-deleted",
  );

  if (!event) {
    throw new Error("server-deleted event was not captured");
  }

  return event;
}

async function createHarness(input?: {
  server?: DeploymentTarget;
  blockers?: ServerDeletionBlocker[];
}) {
  const context = createExecutionContext({
    requestId: "req_delete_server_test",
    entrypoint: "system",
  });
  const repositoryContext = toRepositoryContext(context);
  const servers = new MemoryServerRepository();
  const eventBus = new CapturedEventBus();
  const clock = new FixedClock("2026-01-01T00:00:10.000Z");
  const logger = new NoopLogger();
  const server = input?.server ?? inactiveServerFixture();
  const blockerReader = new FixedServerDeletionBlockerReader(input?.blockers);

  await servers.upsert(repositoryContext, server, UpsertServerSpec.fromServer(server));

  return {
    blockerReader,
    context,
    eventBus,
    repositoryContext,
    servers,
    useCase: new DeleteServerUseCase(servers, blockerReader, clock, eventBus, logger),
  };
}

describe("DeleteServerCommand", () => {
  test("[SRV-LIFE-ENTRY-010] normalizes typed server id confirmation", () => {
    const command = DeleteServerCommand.create({
      serverId: " srv_primary ",
      confirmation: {
        serverId: " srv_primary ",
      },
      idempotencyKey: " delete-key ",
    });

    expect(command.isOk()).toBe(true);
    expect(command._unsafeUnwrap()).toMatchObject({
      serverId: "srv_primary",
      confirmation: {
        serverId: "srv_primary",
      },
      idempotencyKey: "delete-key",
    });
  });
});

describe("DeleteServerUseCase", () => {
  test("[SRV-LIFE-DELETE-001] deletes an inactive server and publishes server-deleted", async () => {
    const { context, eventBus, repositoryContext, servers, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      serverId: "srv_primary",
      confirmation: {
        serverId: "srv_primary",
      },
    });

    expect(result.isOk()).toBe(true);
    const persisted = await servers.findOne(
      repositoryContext,
      ServerByIdSpec.create(DeploymentTargetId.rehydrate("srv_primary")),
    );
    const state = persisted?.toState();
    expect(state?.lifecycleStatus.value).toBe("deleted");
    expect(state?.deletedAt?.value).toBe("2026-01-01T00:00:10.000Z");

    const event = deletedEvent(eventBus.events);
    expect(event.aggregateId).toBe("srv_primary");
    expect(event.payload).toMatchObject({
      serverId: "srv_primary",
      serverName: "Primary",
      providerKey: "generic-ssh",
      deletedAt: "2026-01-01T00:00:10.000Z",
    });
  });

  test("[SRV-LIFE-DELETE-002] blocks active servers before confirmation", async () => {
    const { blockerReader, context, eventBus, useCase } = await createHarness({
      server: activeServerFixture(),
    });

    const result = await useCase.execute(context, {
      serverId: "srv_primary",
      confirmation: {
        serverId: "wrong",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "server_delete_blocked",
      details: {
        phase: "server-lifecycle-guard",
        lifecycleStatus: "active",
        deletionBlockers: ["active-server"],
      },
    });
    expect(blockerReader.calls).toBe(0);
    expect(eventBus.events).toHaveLength(0);
  });

  test("[SRV-LIFE-DELETE-003] reports retained server blockers from the shared blocker reader", async () => {
    const { blockerReader, context, eventBus, useCase } = await createHarness({
      blockers: [
        {
          kind: "deployment-history",
          relatedEntityId: "dep_1",
          relatedEntityType: "deployment",
          count: 2,
        },
        { kind: "resource-placement" },
        { kind: "domain-binding" },
        { kind: "certificate" },
        { kind: "credential" },
        { kind: "server-applied-route" },
        { kind: "source-link" },
        { kind: "default-access-policy" },
        { kind: "runtime-log-retention" },
        { kind: "audit-retention" },
      ],
    });

    const result = await useCase.execute(context, {
      serverId: "srv_primary",
      confirmation: {
        serverId: "srv_primary",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().details?.deletionBlockers).toEqual([
      "deployment-history",
      "resource-placement",
      "domain-binding",
      "certificate",
      "credential",
      "server-applied-route",
      "source-link",
      "default-access-policy",
      "runtime-log-retention",
      "audit-retention",
    ]);
    expect(blockerReader.calls).toBe(1);
    expect(eventBus.events).toHaveLength(0);
  });

  test("[SRV-LIFE-DELETE-004] rejects confirmation mismatch without reading blockers", async () => {
    const { blockerReader, context, eventBus, repositoryContext, servers, useCase } =
      await createHarness();

    const result = await useCase.execute(context, {
      serverId: "srv_primary",
      confirmation: {
        serverId: "srv_other",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "server-lifecycle-guard",
        expectedServerId: "srv_primary",
        actualServerId: "srv_other",
      },
    });
    expect(blockerReader.calls).toBe(0);
    const persisted = await servers.findOne(
      repositoryContext,
      ServerByIdSpec.create(DeploymentTargetId.rehydrate("srv_primary")),
    );
    expect(persisted?.toState().lifecycleStatus.value).toBe("inactive");
    expect(eventBus.events).toHaveLength(0);
  });

  test("[SRV-LIFE-DELETE-005] rejects a missing server before blocker reads", async () => {
    const context = createExecutionContext({
      requestId: "req_delete_missing_server_test",
      entrypoint: "system",
    });
    const blockerReader = new FixedServerDeletionBlockerReader();
    const handler = new DeleteServerUseCase(
      new MemoryServerRepository(),
      blockerReader,
      new FixedClock("2026-01-01T00:00:10.000Z"),
      new CapturedEventBus(),
      new NoopLogger(),
    );

    const result = await handler.execute(context, {
      serverId: "srv_missing",
      confirmation: {
        serverId: "srv_missing",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "not_found",
      details: {
        phase: "server-admission",
        serverId: "srv_missing",
      },
    });
    expect(blockerReader.calls).toBe(0);
  });

  test("[SRV-LIFE-DELETE-006] treats a resolvable deleted tombstone as idempotent", async () => {
    const { context, eventBus, repositoryContext, servers, useCase } = await createHarness({
      server: deletedServerFixture(),
    });

    const result = await useCase.execute(context, {
      serverId: "srv_primary",
      confirmation: {
        serverId: "srv_primary",
      },
    });

    expect(result.isOk()).toBe(true);
    expect(eventBus.events).toHaveLength(0);
    const persisted = await servers.findOne(
      repositoryContext,
      ServerByIdSpec.create(DeploymentTargetId.rehydrate("srv_primary")),
    );
    expect(persisted?.toState().deletedAt?.value).toBe("2026-01-01T00:00:06.000Z");
  });

  test("[SRV-LIFE-DELETE-007] omits deleted servers from list and show read models", async () => {
    const { context, repositoryContext, servers } = await createHarness({
      server: deletedServerFixture(),
    });
    const readModel = new MemoryServerReadModel(servers);
    const showService = new ShowServerQueryService(
      readModel,
      new EmptyDeploymentReadModel(),
      new EmptyDomainBindingReadModel(),
      new FixedClock("2026-01-01T00:00:10.000Z"),
    );

    const listed = await readModel.list(repositoryContext);
    const shown = await showService.execute(
      context,
      ShowServerQuery.create({ serverId: "srv_primary" })._unsafeUnwrap(),
    );

    expect(listed).toEqual([]);
    expect(shown.isErr()).toBe(true);
    expect(shown._unsafeUnwrapErr()).toMatchObject({
      code: "not_found",
      details: {
        phase: "server-read",
      },
    });
  });
});
