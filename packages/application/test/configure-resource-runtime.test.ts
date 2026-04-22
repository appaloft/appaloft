import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  ArchivedAt,
  CommandText,
  CreatedAt,
  type DomainEvent,
  EnvironmentId,
  HealthCheckExpectedStatusCode,
  HealthCheckHostText,
  HealthCheckHttpMethodValue,
  HealthCheckIntervalSeconds,
  HealthCheckPathText,
  HealthCheckRetryCount,
  HealthCheckSchemeValue,
  HealthCheckStartPeriodSeconds,
  HealthCheckTimeoutSeconds,
  HealthCheckTypeValue,
  ProjectId,
  Resource,
  ResourceByIdSpec,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  ResourceSlug,
  RuntimePlanStrategyValue,
  UpsertResourceSpec,
} from "@appaloft/core";
import {
  CapturedEventBus,
  FixedClock,
  MemoryResourceRepository,
  NoopLogger,
} from "@appaloft/testkit";

import { createExecutionContext, toRepositoryContext } from "../src";
import { ConfigureResourceRuntimeUseCase } from "../src/use-cases";

function applicationResourceFixture(): Resource {
  return Resource.rehydrate({
    id: ResourceId.rehydrate("res_web"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    name: ResourceName.rehydrate("Web"),
    slug: ResourceSlug.rehydrate("web"),
    kind: ResourceKindValue.rehydrate("application"),
    services: [],
    runtimeProfile: {
      strategy: RuntimePlanStrategyValue.rehydrate("workspace-commands"),
      startCommand: CommandText.rehydrate("bun run start"),
      healthCheckPath: HealthCheckPathText.rehydrate("/health"),
      healthCheck: {
        enabled: true,
        type: HealthCheckTypeValue.rehydrate("http"),
        intervalSeconds: HealthCheckIntervalSeconds.rehydrate(5),
        timeoutSeconds: HealthCheckTimeoutSeconds.rehydrate(5),
        retries: HealthCheckRetryCount.rehydrate(10),
        startPeriodSeconds: HealthCheckStartPeriodSeconds.rehydrate(5),
        http: {
          method: HealthCheckHttpMethodValue.rehydrate("GET"),
          scheme: HealthCheckSchemeValue.rehydrate("http"),
          host: HealthCheckHostText.rehydrate("localhost"),
          path: HealthCheckPathText.rehydrate("/health"),
          expectedStatusCode: HealthCheckExpectedStatusCode.rehydrate(200),
        },
      },
    },
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

function archivedApplicationResourceFixture(): Resource {
  const resource = applicationResourceFixture();
  resource
    .archive({
      archivedAt: ArchivedAt.rehydrate("2026-01-01T00:00:05.000Z"),
    })
    ._unsafeUnwrap();
  return resource;
}

function configuredEvent(events: unknown[]): DomainEvent {
  const event = events.find(
    (candidate): candidate is DomainEvent =>
      Boolean(candidate) &&
      typeof candidate === "object" &&
      (candidate as { type?: unknown }).type === "resource-runtime-configured",
  );

  if (!event) {
    throw new Error("resource-runtime-configured event was not captured");
  }

  return event;
}

async function createHarness(resource: Resource = applicationResourceFixture()) {
  const context = createExecutionContext({
    requestId: "req_configure_resource_runtime_test",
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
    useCase: new ConfigureResourceRuntimeUseCase(resources, clock, eventBus, logger),
  };
}

describe("ConfigureResourceRuntimeUseCase", () => {
  test("[RES-PROFILE-RUNTIME-001] configures static runtime profile", async () => {
    const { context, eventBus, repositoryContext, resources, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      runtimeProfile: {
        strategy: "static",
        runtimeName: "preview-123",
        publishDirectory: "dist",
      },
    });

    expect(result.isOk()).toBe(true);
    const persisted = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
    );
    const runtimeProfile = persisted?.toState().runtimeProfile;
    expect(runtimeProfile?.strategy.value).toBe("static");
    expect(runtimeProfile?.runtimeName?.value).toBe("preview-123");
    expect(runtimeProfile?.publishDirectory?.value).toBe("/dist");
    expect(runtimeProfile?.healthCheckPath?.value).toBe("/health");
    expect(runtimeProfile?.healthCheck?.http?.path.value).toBe("/health");

    const event = configuredEvent(eventBus.events);
    expect(event.aggregateId).toBe("res_web");
    expect(event.payload).toMatchObject({
      resourceId: "res_web",
      projectId: "prj_demo",
      environmentId: "env_demo",
      runtimePlanStrategy: "static",
      runtimeName: "preview-123",
      configuredAt: "2026-01-01T00:00:10.000Z",
    });
  });

  test("[RES-PROFILE-RUNTIME-002] rejects health policy mutation", async () => {
    const { context, eventBus, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      runtimeProfile: {
        strategy: "workspace-commands",
        startCommand: "bun run start",
        healthCheck: {
          enabled: true,
          type: "http",
          http: {
            path: "/ready",
          },
        },
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "resource-runtime-resolution",
        field: "runtimeProfile.healthCheck",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });

  test("[RES-PROFILE-RUNTIME-003] rejects unsafe Dockerfile paths", async () => {
    const { context, eventBus, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      runtimeProfile: {
        strategy: "dockerfile",
        dockerfilePath: "../Dockerfile",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "resource-runtime-resolution",
        field: "runtimeProfile.dockerfilePath",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });

  test("[RES-PROFILE-RUNTIME-004] rejects runtime target configuration", async () => {
    const { context, eventBus, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      runtimeProfile: {
        strategy: "dockerfile",
        dockerfilePath: "Dockerfile",
        kubernetesNamespace: "default",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "resource-runtime-resolution",
        field: "runtimeProfile.kubernetesNamespace",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });

  test("[RES-PROFILE-RUNTIME-005] rejects runtime changes for archived resources", async () => {
    const { context, eventBus, useCase } = await createHarness(
      archivedApplicationResourceFixture(),
    );

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      runtimeProfile: {
        strategy: "static",
        publishDirectory: "dist",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "resource_archived",
      details: {
        phase: "resource-lifecycle-guard",
        resourceId: "res_web",
        commandName: "resources.configure-runtime",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });
});
