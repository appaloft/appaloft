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
  MemoryResourceRepository,
  NoopLogger,
} from "@appaloft/testkit";

import { createExecutionContext, RestoreResourceUseCase, toRepositoryContext } from "../src";

function resourceFixture(input?: {
  lifecycleStatus?: "active" | "archived" | "deleted";
}): Resource {
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
    lifecycleStatus: ResourceLifecycleStatusValue.rehydrate(input?.lifecycleStatus ?? "active"),
    ...(input?.lifecycleStatus === "archived"
      ? {
          archivedAt: ArchivedAt.rehydrate("2026-01-01T00:00:05.000Z"),
          archiveReason: ArchiveReason.rehydrate("Old test resource"),
        }
      : {}),
    ...(input?.lifecycleStatus === "deleted"
      ? { deletedAt: DeletedAt.rehydrate("2026-01-01T00:00:06.000Z") }
      : {}),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

function restoredEvent(events: unknown[]): DomainEvent {
  const event = events.find(
    (candidate): candidate is DomainEvent =>
      Boolean(candidate) &&
      typeof candidate === "object" &&
      (candidate as { type?: unknown }).type === "resource-restored",
  );

  if (!event) {
    throw new Error("resource-restored event was not captured");
  }

  return event;
}

async function createHarness(resource: Resource = resourceFixture()) {
  const context = createExecutionContext({
    requestId: "req_restore_resource_test",
    entrypoint: "system",
  });
  const repositoryContext = toRepositoryContext(context);
  const resources = new MemoryResourceRepository();
  const eventBus = new CapturedEventBus();
  const clock = new FixedClock("2026-01-01T00:00:10.000Z");
  const logger = new NoopLogger();

  await resources.upsert(repositoryContext, resource, UpsertResourceSpec.fromResource(resource));

  return {
    context,
    repositoryContext,
    resources,
    eventBus,
    useCase: new RestoreResourceUseCase(resources, clock, eventBus, logger),
  };
}

describe("RestoreResourceUseCase", () => {
  test("[RES-PROFILE-RESTORE-001][RES-PROFILE-EVT-003] restores an archived resource and publishes resource-restored", async () => {
    const { context, eventBus, repositoryContext, resources, useCase } = await createHarness(
      resourceFixture({ lifecycleStatus: "archived" }),
    );

    const result = await useCase.execute(context, {
      resourceId: "res_web",
    });

    expect(result.isOk()).toBe(true);
    const persisted = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
    );
    const state = persisted?.toState();
    expect(state?.lifecycleStatus.value).toBe("active");
    expect(state?.archivedAt).toBeUndefined();
    expect(state?.archiveReason).toBeUndefined();
    expect(state?.sourceBinding?.locator.value).toBe("https://github.com/acme/web.git");
    expect(state?.runtimeProfile?.startCommand?.value).toBe("bun run start");
    expect(state?.networkProfile?.internalPort.value).toBe(3000);

    const event = restoredEvent(eventBus.events);
    expect(event.aggregateId).toBe("res_web");
    expect(event.payload).toMatchObject({
      resourceId: "res_web",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceSlug: "web",
      restoredAt: "2026-01-01T00:00:10.000Z",
      previousArchivedAt: "2026-01-01T00:00:05.000Z",
      previousArchiveReason: "Old test resource",
    });
  });

  test("[RES-PROFILE-RESTORE-002] treats an already active resource as idempotent", async () => {
    const { context, eventBus, repositoryContext, resources, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      resourceId: "res_web",
    });

    expect(result.isOk()).toBe(true);
    expect(eventBus.events).toHaveLength(0);
    const persisted = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
    );
    expect(persisted?.toState().lifecycleStatus.value).toBe("active");
  });

  test("[RES-PROFILE-RESTORE-003] rejects deleted resource restore", async () => {
    const { context, eventBus, useCase } = await createHarness(
      resourceFixture({ lifecycleStatus: "deleted" }),
    );

    const result = await useCase.execute(context, {
      resourceId: "res_web",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "invariant_violation",
      details: {
        status: "deleted",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });
});
