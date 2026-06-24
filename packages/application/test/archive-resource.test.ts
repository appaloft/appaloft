import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  ArchivedAt,
  ArchiveReason,
  CommandText,
  CreatedAt,
  DisplayNameText,
  type DomainEvent,
  EnvironmentId,
  err,
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
  type Result,
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

import { createExecutionContext, toRepositoryContext } from "../src";
import {
  type ResourceRuntimeControlCommandResult,
  type ResourceRuntimeControlOperation,
} from "../src/ports";
import { ArchiveResourceUseCase } from "../src/use-cases";

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

function archivedEvent(events: unknown[]): DomainEvent {
  const event = events.find(
    (candidate): candidate is DomainEvent =>
      Boolean(candidate) &&
      typeof candidate === "object" &&
      (candidate as { type?: unknown }).type === "resource-archived",
  );

  if (!event) {
    throw new Error("resource-archived event was not captured");
  }

  return event;
}

type RuntimeStopInput = {
  operation: ResourceRuntimeControlOperation;
  resourceId: string;
  reason?: string;
  idempotencyKey?: string;
};

class RecordingRuntimeStopper {
  readonly requests: RuntimeStopInput[] = [];

  constructor(
    private readonly result: Result<ResourceRuntimeControlCommandResult> = ok({
      runtimeControlAttemptId: "rtc_archive_stop",
      resourceId: "res_web",
      deploymentId: "dep_web",
      operation: "stop",
      status: "succeeded",
      startedAt: "2026-01-01T00:00:09.000Z",
      completedAt: "2026-01-01T00:00:09.500Z",
      runtimeState: "stopped",
    }),
  ) {}

  async execute(_context: unknown, input: RuntimeStopInput) {
    this.requests.push(input);
    return this.result;
  }
}

async function createHarness(
  resource: Resource = resourceFixture(),
  input?: {
    runtimeStopper?: RecordingRuntimeStopper;
  },
) {
  const context = createExecutionContext({
    requestId: "req_archive_resource_test",
    entrypoint: "system",
  });
  const repositoryContext = toRepositoryContext(context);
  const resources = new MemoryResourceRepository();
  const eventBus = new CapturedEventBus();
  const clock = new FixedClock("2026-01-01T00:00:10.000Z");
  const logger = new NoopLogger();
  const runtimeStopper = input?.runtimeStopper ?? new RecordingRuntimeStopper();

  await resources.upsert(repositoryContext, resource, UpsertResourceSpec.fromResource(resource));

  return {
    context,
    repositoryContext,
    resources,
    eventBus,
    runtimeStopper,
    useCase: new ArchiveResourceUseCase(resources, clock, eventBus, logger, runtimeStopper),
  };
}

describe("ArchiveResourceUseCase", () => {
  test("[RES-PROFILE-ARCHIVE-001] archives an active resource and publishes resource-archived", async () => {
    const { context, eventBus, repositoryContext, resources, runtimeStopper, useCase } =
      await createHarness();

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      reason: "Retired after migration",
    });

    expect(result.isOk()).toBe(true);
    const persisted = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
    );
    const state = persisted?.toState();
    expect(state?.lifecycleStatus.value).toBe("archived");
    expect(state?.archivedAt?.value).toBe("2026-01-01T00:00:10.000Z");
    expect(state?.archiveReason?.value).toBe("Retired after migration");

    const event = archivedEvent(eventBus.events);
    expect(event.aggregateId).toBe("res_web");
    expect(event.payload).toMatchObject({
      resourceId: "res_web",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceSlug: "web",
      archivedAt: "2026-01-01T00:00:10.000Z",
      reason: "Retired after migration",
    });
    expect(runtimeStopper.requests).toEqual([
      {
        operation: "stop",
        resourceId: "res_web",
        reason: "archive: Retired after migration",
      },
    ]);
  });

  test("[RES-PROFILE-ARCHIVE-002] treats an already archived resource as lifecycle-idempotent while stopping retained runtime", async () => {
    const { context, eventBus, repositoryContext, resources, runtimeStopper, useCase } =
      await createHarness(archivedResourceFixture());

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      reason: "New reason must not overwrite",
    });

    expect(result.isOk()).toBe(true);
    expect(eventBus.events).toHaveLength(0);
    const persisted = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
    );
    const state = persisted?.toState();
    expect(state?.archivedAt?.value).toBe("2026-01-01T00:00:05.000Z");
    expect(state?.archiveReason?.value).toBe("Old test resource");
    expect(runtimeStopper.requests).toEqual([
      {
        operation: "stop",
        resourceId: "res_web",
        reason: "archive: New reason must not overwrite",
      },
    ]);
  });

  test("[RES-PROFILE-ARCHIVE-003] keeps durable profile state after archive", async () => {
    const { context, repositoryContext, resources, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      resourceId: "res_web",
    });

    expect(result.isOk()).toBe(true);
    const persisted = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
    );
    const state = persisted?.toState();
    expect(state?.sourceBinding?.locator.value).toBe("https://github.com/acme/web.git");
    expect(state?.runtimeProfile?.startCommand?.value).toBe("bun run start");
    expect(state?.networkProfile?.internalPort.value).toBe(3000);
  });

  test("[RES-PROFILE-ARCHIVE-003A] archives when no current runtime placement is retained", async () => {
    const runtimeStopper = new RecordingRuntimeStopper(
      err({
        code: "resource_runtime_metadata_missing",
        category: "user",
        message: "Resource runtime placement metadata is missing",
        retryable: false,
        details: {
          phase: "runtime-control-admission",
          resourceId: "res_web",
          operation: "stop",
          missingMetadataKind: "runtime-placement",
        },
      }),
    );
    const { context, eventBus, repositoryContext, resources, useCase } = await createHarness(
      resourceFixture(),
      { runtimeStopper },
    );

    const result = await useCase.execute(context, {
      resourceId: "res_web",
    });

    expect(result.isOk()).toBe(true);
    const persisted = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
    );
    expect(persisted?.toState().lifecycleStatus.value).toBe("archived");
    expect(archivedEvent(eventBus.events).aggregateId).toBe("res_web");
  });

  test("[RES-PROFILE-ARCHIVE-005] rejects archive reasons containing obvious secret material", async () => {
    const { context, eventBus, useCase } = await createHarness();
    const secretValue = "password=super-secret";

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      reason: secretValue,
    });

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error).toMatchObject({
      code: "validation_error",
      details: {
        phase: "resource-archive",
        field: "reason",
      },
    });
    expect(JSON.stringify(error)).not.toContain(secretValue);
    expect(eventBus.events).toHaveLength(0);
  });

  test("[RES-PROFILE-ARCHIVE-006] blocks archive when runtime stop fails", async () => {
    const runtimeStopper = new RecordingRuntimeStopper(
      ok({
        runtimeControlAttemptId: "rtc_archive_stop_failed",
        resourceId: "res_web",
        deploymentId: "dep_web",
        operation: "stop",
        status: "failed",
        startedAt: "2026-01-01T00:00:09.000Z",
        completedAt: "2026-01-01T00:00:09.500Z",
        runtimeState: "unknown",
        errorCode: "runtime_control_adapter_failed",
      }),
    );
    const { context, eventBus, repositoryContext, resources, useCase } = await createHarness(
      resourceFixture(),
      { runtimeStopper },
    );

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      reason: "Retired after migration",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "provider_error",
      retryable: true,
      details: {
        phase: "resource-archive-runtime-stop",
        resourceId: "res_web",
        runtimeControlAttemptId: "rtc_archive_stop_failed",
        runtimeControlStatus: "failed",
        runtimeState: "unknown",
        safeAdapterErrorCode: "runtime_control_adapter_failed",
      },
    });
    const persisted = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
    );
    expect(persisted?.toState().lifecycleStatus.value).toBe("active");
    expect(eventBus.events).toHaveLength(0);
  });
});
