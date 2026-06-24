import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  ArchivedAt,
  ArchiveReason,
  CommandText,
  CreatedAt,
  DeletedAt,
  DisplayNameText,
  type DomainEvent,
  EnvironmentId,
  ok,
  PortNumber,
  ProjectId,
  Resource,
  ResourceByIdSpec,
  ResourceExposureModeValue,
  ResourceId,
  ResourceKindValue,
  ResourceLifecycleStatusValue,
  ResourceName,
  ResourceNetworkProtocolValue,
  ResourceSlug,
  RuntimePlanStrategyValue,
  SourceKindValue,
  SourceLocator,
  UpsertResourceSpec,
} from "@appaloft/core";
import {
  CapturedEventBus,
  FixedClock,
  MemoryResourceReadModel,
  MemoryResourceRepository,
  NoopLogger,
} from "@appaloft/testkit";

import { createExecutionContext, type ResourceDeletionBlocker, toRepositoryContext } from "../src";
import { CheckResourceDeleteSafetyQuery, DeleteResourceCommand } from "../src/messages";
import { type ResourceDeletionBlockerReader } from "../src/ports";
import { CheckResourceDeleteSafetyQueryService, DeleteResourceUseCase } from "../src/use-cases";

function resourceFixture(): Resource {
  return Resource.rehydrate({
    id: ResourceId.rehydrate("res_web"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    name: ResourceName.rehydrate("Web"),
    slug: ResourceSlug.rehydrate("web"),
    kind: ResourceKindValue.rehydrate("application"),
    services: [],
    sourceBinding: {
      kind: SourceKindValue.rehydrate("git-public"),
      locator: SourceLocator.rehydrate("https://github.com/acme/web.git"),
      displayName: DisplayNameText.rehydrate("acme/web"),
    },
    runtimeProfile: {
      strategy: RuntimePlanStrategyValue.rehydrate("workspace-commands"),
      startCommand: CommandText.rehydrate("bun run start"),
    },
    networkProfile: {
      internalPort: PortNumber.rehydrate(3000),
      upstreamProtocol: ResourceNetworkProtocolValue.rehydrate("http"),
      exposureMode: ResourceExposureModeValue.rehydrate("reverse-proxy"),
    },
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

function archivedResourceFixture(): Resource {
  return Resource.rehydrate({
    ...resourceFixture().toState(),
    lifecycleStatus: ResourceLifecycleStatusValue.rehydrate("archived"),
    archivedAt: ArchivedAt.rehydrate("2026-01-01T00:00:05.000Z"),
    archiveReason: ArchiveReason.rehydrate("Old test resource"),
  });
}

function deletedResourceFixture(): Resource {
  return Resource.rehydrate({
    ...archivedResourceFixture().toState(),
    lifecycleStatus: ResourceLifecycleStatusValue.rehydrate("deleted"),
    deletedAt: DeletedAt.rehydrate("2026-01-01T00:00:06.000Z"),
  });
}

class FixedDeletionBlockerReader implements ResourceDeletionBlockerReader {
  constructor(private readonly blockers: ResourceDeletionBlocker[] = []) {}

  async findBlockers() {
    return ok(this.blockers);
  }
}

function deletedEvent(events: unknown[]): DomainEvent {
  const event = events.find(
    (candidate): candidate is DomainEvent =>
      Boolean(candidate) &&
      typeof candidate === "object" &&
      (candidate as { type?: unknown }).type === "resource-deleted",
  );

  if (!event) {
    throw new Error("resource-deleted event was not captured");
  }

  return event;
}

async function createHarness(input?: {
  resource?: Resource;
  blockers?: ResourceDeletionBlocker[];
}) {
  const context = createExecutionContext({
    requestId: "req_delete_resource_test",
    entrypoint: "system",
  });
  const repositoryContext = toRepositoryContext(context);
  const resources = new MemoryResourceRepository();
  const eventBus = new CapturedEventBus();
  const clock = new FixedClock("2026-01-01T00:00:10.000Z");
  const logger = new NoopLogger();
  const resource = input?.resource ?? archivedResourceFixture();

  await resources.upsert(repositoryContext, resource, UpsertResourceSpec.fromResource(resource));

  return {
    context,
    repositoryContext,
    resources,
    eventBus,
    useCase: new DeleteResourceUseCase(
      resources,
      new FixedDeletionBlockerReader(input?.blockers),
      clock,
      eventBus,
      logger,
    ),
  };
}

describe("DeleteResourceCommand", () => {
  test("[RES-PROFILE-ENTRY-006] normalizes typed slug confirmation", () => {
    const command = DeleteResourceCommand.create({
      resourceId: " res_web ",
      confirmation: {
        resourceSlug: " web ",
      },
      idempotencyKey: " delete-key ",
    });

    expect(command.isOk()).toBe(true);
    expect(command._unsafeUnwrap()).toMatchObject({
      resourceId: "res_web",
      confirmation: {
        resourceSlug: "web",
      },
      idempotencyKey: "delete-key",
    });
  });
});

describe("DeleteResourceUseCase", () => {
  test("[RES-PROFILE-DELETE-CHECK-001] active resource delete-check returns active-resource blocker", async () => {
    const { context, resources } = await createHarness({ resource: resourceFixture() });
    const service = new CheckResourceDeleteSafetyQueryService(
      resources,
      new FixedDeletionBlockerReader(),
      new FixedClock("2026-01-01T00:00:10.000Z"),
    );

    const result = await service.execute(context, new CheckResourceDeleteSafetyQuery("res_web"));

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "resources.delete-check/v1",
      resourceId: "res_web",
      lifecycleStatus: "active",
      eligible: false,
      blockers: [
        {
          kind: "active-resource",
          relatedEntityId: "res_web",
          relatedEntityType: "resource",
          count: 1,
        },
      ],
      checkedAt: "2026-01-01T00:00:10.000Z",
    });
  });

  test("[RES-PROFILE-DELETE-CHECK-002] archived resource delete-check reports retained blockers", async () => {
    const { context, resources } = await createHarness();
    const service = new CheckResourceDeleteSafetyQueryService(
      resources,
      new FixedDeletionBlockerReader([
        {
          kind: "server-applied-route",
          relatedEntityId: "route_set_1",
          relatedEntityType: "server-applied-route",
          count: 1,
        },
      ]),
      new FixedClock("2026-01-01T00:00:10.000Z"),
    );

    const result = await service.execute(context, new CheckResourceDeleteSafetyQuery("res_web"));

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "resources.delete-check/v1",
      resourceId: "res_web",
      lifecycleStatus: "archived",
      eligible: false,
      blockers: [
        {
          kind: "server-applied-route",
          relatedEntityId: "route_set_1",
          relatedEntityType: "server-applied-route",
          count: 1,
        },
      ],
    });
  });

  test("[RES-PROFILE-DELETE-CHECK-003] archived resource delete-check is eligible without retained blockers", async () => {
    const { context, resources } = await createHarness();
    const service = new CheckResourceDeleteSafetyQueryService(
      resources,
      new FixedDeletionBlockerReader(),
      new FixedClock("2026-01-01T00:00:10.000Z"),
    );

    const result = await service.execute(context, new CheckResourceDeleteSafetyQuery("res_web"));

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "resources.delete-check/v1",
      resourceId: "res_web",
      lifecycleStatus: "archived",
      eligible: true,
      blockers: [],
    });
  });

  test("[RES-PROFILE-DELETE-001] deletes an archived resource and publishes resource-deleted", async () => {
    const { context, eventBus, repositoryContext, resources, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      confirmation: {
        resourceSlug: "web",
      },
    });

    expect(result.isOk()).toBe(true);
    const persisted = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
    );
    const state = persisted?.toState();
    expect(state?.lifecycleStatus.value).toBe("deleted");
    expect(state?.deletedAt?.value).toBe("2026-01-01T00:00:10.000Z");

    const event = deletedEvent(eventBus.events);
    expect(event.aggregateId).toBe("res_web");
    expect(event.payload).toMatchObject({
      resourceId: "res_web",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceSlug: "web",
      deletedAt: "2026-01-01T00:00:10.000Z",
    });
  });

  test("[RES-PROFILE-DELETE-002] blocks active resources before confirmation", async () => {
    const { context, eventBus, useCase } = await createHarness({
      resource: resourceFixture(),
    });

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      confirmation: {
        resourceSlug: "wrong",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "resource_delete_blocked",
      details: {
        phase: "resource-deletion-guard",
        lifecycleStatus: "active",
        deletionBlockers: ["active-resource"],
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });

  test("[RES-PROFILE-DELETE-003] rejects slug confirmation mismatch without mutation", async () => {
    const { context, eventBus, repositoryContext, resources, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      confirmation: {
        resourceSlug: "not-web",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "resource-deletion-guard",
        expectedResourceSlug: "web",
        actualResourceSlug: "not-web",
      },
    });
    const persisted = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
    );
    expect(persisted?.toState().lifecycleStatus.value).toBe("archived");
    expect(eventBus.events).toHaveLength(0);
  });

  test("[RES-PROFILE-DELETE-004] deletes archived resources even when deployment history exists", async () => {
    const { context, eventBus, repositoryContext, resources, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      confirmation: {
        resourceSlug: "web",
      },
    });

    expect(result.isOk()).toBe(true);
    const persisted = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
    );
    expect(persisted?.toState().lifecycleStatus.value).toBe("deleted");
    expect(deletedEvent(eventBus.events).aggregateId).toBe("res_web");
  });

  test("[RES-PROFILE-DELETE-005] reports domain, certificate, and route blockers", async () => {
    const { context, eventBus, useCase } = await createHarness({
      blockers: [
        { kind: "domain-binding" },
        { kind: "certificate" },
        { kind: "generated-access-route" },
        { kind: "server-applied-route" },
        { kind: "proxy-route" },
      ],
    });

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      confirmation: {
        resourceSlug: "web",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().details?.deletionBlockers).toEqual([
      "domain-binding",
      "certificate",
      "generated-access-route",
      "server-applied-route",
      "proxy-route",
    ]);
    expect(eventBus.events).toHaveLength(0);
  });

  test("[RES-PROFILE-DELETE-006] reports source, dependency, terminal, and log blockers without treating audit history as a blocker", async () => {
    const { context, eventBus, useCase } = await createHarness({
      blockers: [
        { kind: "source-link" },
        { kind: "dependency-binding" },
        { kind: "terminal-session" },
        { kind: "runtime-log-retention" },
        { kind: "audit-retention" },
      ],
    });

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      confirmation: {
        resourceSlug: "web",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().details?.deletionBlockers).toEqual([
      "source-link",
      "dependency-binding",
      "terminal-session",
      "runtime-log-retention",
    ]);
    expect(eventBus.events).toHaveLength(0);
  });

  test("[RES-PROFILE-DELETE-007] treats a resolvable deleted tombstone as idempotent", async () => {
    const { context, eventBus, repositoryContext, resources, useCase } = await createHarness({
      resource: deletedResourceFixture(),
    });

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      confirmation: {
        resourceSlug: "web",
      },
    });

    expect(result.isOk()).toBe(true);
    expect(eventBus.events).toHaveLength(0);
    const persisted = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
    );
    expect(persisted?.toState().deletedAt?.value).toBe("2026-01-01T00:00:06.000Z");
  });

  test("[RES-PROFILE-DELETE-008] omits deleted resources from resources.list read models", async () => {
    const { repositoryContext, resources } = await createHarness({
      resource: deletedResourceFixture(),
    });
    const readModel = new MemoryResourceReadModel(resources);

    const listed = await readModel.list(repositoryContext);

    expect(listed).toEqual([]);
  });

  test("[RES-PROFILE-LIST-009] omits archived resources from default resources.list read models", async () => {
    const { repositoryContext, resources } = await createHarness({
      resource: archivedResourceFixture(),
    });
    const readModel = new MemoryResourceReadModel(resources);

    const listed = await readModel.list(repositoryContext);

    expect(listed).toEqual([]);
  });

  test("[RES-PROFILE-LIST-010] includes archived resource lifecycle metadata when resources.list asks for archived resources", async () => {
    const { repositoryContext, resources } = await createHarness({
      resource: archivedResourceFixture(),
    });
    const readModel = new MemoryResourceReadModel(resources);

    const listed = await readModel.list(repositoryContext, { lifecycleStatus: "archived" });

    expect(listed).toMatchObject([
      {
        id: "res_web",
        lifecycleStatus: "archived",
        archivedAt: "2026-01-01T00:00:05.000Z",
        archiveReason: "Old test resource",
      },
    ]);
  });
});
