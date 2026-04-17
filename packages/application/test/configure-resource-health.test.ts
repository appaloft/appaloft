import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CommandText,
  CreatedAt,
  type DomainEvent,
  EnvironmentId,
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
import { ConfigureResourceHealthCommand } from "../src/messages";
import { ConfigureResourceHealthUseCase } from "../src/use-cases";

function resourceFixture(): Resource {
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
    },
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

function configuredEvent(events: unknown[]): DomainEvent {
  const event = events.find(
    (candidate): candidate is DomainEvent =>
      Boolean(candidate) &&
      typeof candidate === "object" &&
      (candidate as { type?: unknown }).type === "resource-health-policy-configured",
  );

  if (!event) {
    throw new Error("resource-health-policy-configured event was not captured");
  }

  return event;
}

async function createHarness() {
  const context = createExecutionContext({
    requestId: "req_configure_resource_health_test",
    entrypoint: "system",
  });
  const repositoryContext = toRepositoryContext(context);
  const resources = new MemoryResourceRepository();
  const eventBus = new CapturedEventBus();
  const clock = new FixedClock("2026-01-01T00:00:10.000Z");
  const logger = new NoopLogger();
  const resource = resourceFixture();

  await resources.upsert(repositoryContext, resource, UpsertResourceSpec.fromResource(resource));

  return {
    context,
    repositoryContext,
    resources,
    eventBus,
    useCase: new ConfigureResourceHealthUseCase(resources, clock, eventBus, logger),
  };
}

describe("ConfigureResourceHealthUseCase", () => {
  test("[RES-HEALTH-CFG-002] configures HTTP health policy and preserves runtime profile fields", async () => {
    const { context, eventBus, repositoryContext, resources, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      healthCheck: {
        enabled: true,
        type: "http",
        intervalSeconds: 7,
        timeoutSeconds: 3,
        retries: 4,
        startPeriodSeconds: 2,
        http: {
          method: "GET",
          scheme: "http",
          host: "localhost",
          path: "/health",
          expectedStatusCode: 204,
        },
      },
    });

    expect(result.isOk()).toBe(true);
    const persisted = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
    );
    const state = persisted?.toState();
    expect(state?.runtimeProfile?.strategy.value).toBe("workspace-commands");
    expect(state?.runtimeProfile?.startCommand?.value).toBe("bun run start");
    expect(state?.runtimeProfile?.healthCheckPath?.value).toBe("/health");
    expect(state?.runtimeProfile?.healthCheck?.http?.expectedStatusCode.value).toBe(204);
    expect(state?.runtimeProfile?.healthCheck?.timeoutSeconds.value).toBe(3);

    const event = configuredEvent(eventBus.events);
    expect(event.aggregateId).toBe("res_web");
    expect(event.payload).toMatchObject({
      resourceId: "res_web",
      projectId: "prj_demo",
      environmentId: "env_demo",
      enabled: true,
      type: "http",
      configuredAt: "2026-01-01T00:00:10.000Z",
      http: {
        path: "/health",
        expectedStatusCode: 204,
      },
    });
  });

  test("[RES-HEALTH-CFG-003] stores disabled health policy without stale health path", async () => {
    const { context, repositoryContext, resources, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      healthCheck: {
        enabled: false,
        type: "http",
        intervalSeconds: 5,
        timeoutSeconds: 5,
        retries: 10,
        startPeriodSeconds: 5,
      },
    });

    expect(result.isOk()).toBe(true);
    const persisted = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
    );
    const state = persisted?.toState();
    expect(state?.runtimeProfile?.healthCheck?.enabled).toBe(false);
    expect(state?.runtimeProfile?.healthCheckPath).toBeUndefined();
    expect(state?.runtimeProfile?.startCommand?.value).toBe("bun run start");
  });

  test("[RES-HEALTH-CFG-004] rejects missing resource without publishing event", async () => {
    const { context, eventBus, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      resourceId: "res_missing",
      healthCheck: {
        enabled: true,
        type: "http",
        intervalSeconds: 5,
        timeoutSeconds: 5,
        retries: 10,
        startPeriodSeconds: 5,
        http: {
          method: "GET",
          scheme: "http",
          host: "localhost",
          path: "/health",
          expectedStatusCode: 200,
        },
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("not_found");
    expect(eventBus.events).toHaveLength(0);
  });

  test("[RES-HEALTH-CFG-005] rejects enabled HTTP policy without HTTP config at schema boundary", () => {
    const command = ConfigureResourceHealthCommand.create({
      resourceId: "res_web",
      healthCheck: {
        enabled: true,
        type: "http",
      },
    });

    expect(command.isErr()).toBe(true);
    expect(command._unsafeUnwrapErr().code).toBe("validation_error");
  });
});
