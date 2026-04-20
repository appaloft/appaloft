import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  ArchivedAt,
  CreatedAt,
  type DomainEvent,
  EnvironmentId,
  ProjectId,
  Resource,
  ResourceByIdSpec,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  ResourceServiceKindValue,
  ResourceServiceName,
  ResourceSlug,
  UpsertResourceSpec,
} from "@appaloft/core";
import {
  CapturedEventBus,
  FixedClock,
  MemoryResourceRepository,
  NoopLogger,
} from "@appaloft/testkit";

import { createExecutionContext, toRepositoryContext } from "../src";
import { ConfigureResourceNetworkCommand } from "../src/messages";
import { ConfigureResourceNetworkUseCase } from "../src/use-cases";

function applicationResourceFixture(id = "res_web", name = "Web"): Resource {
  return Resource.rehydrate({
    id: ResourceId.rehydrate(id),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    name: ResourceName.rehydrate(name),
    slug: ResourceSlug.rehydrate(name.toLowerCase()),
    kind: ResourceKindValue.rehydrate("application"),
    services: [],
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

function composeStackResourceFixture(): Resource {
  return Resource.rehydrate({
    id: ResourceId.rehydrate("res_compose"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    name: ResourceName.rehydrate("Stack"),
    slug: ResourceSlug.rehydrate("stack"),
    kind: ResourceKindValue.rehydrate("compose-stack"),
    services: [
      {
        name: ResourceServiceName.rehydrate("web"),
        kind: ResourceServiceKindValue.rehydrate("web"),
      },
      {
        name: ResourceServiceName.rehydrate("worker"),
        kind: ResourceServiceKindValue.rehydrate("worker"),
      },
    ],
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

function configuredEvent(events: unknown[]): DomainEvent {
  const event = events.find(
    (candidate): candidate is DomainEvent =>
      Boolean(candidate) &&
      typeof candidate === "object" &&
      (candidate as { type?: unknown }).type === "resource-network-configured",
  );

  if (!event) {
    throw new Error("resource-network-configured event was not captured");
  }

  return event;
}

async function createHarness(resourcesToSeed: Resource[] = [applicationResourceFixture()]) {
  const context = createExecutionContext({
    requestId: "req_configure_resource_network_test",
    entrypoint: "system",
  });
  const repositoryContext = toRepositoryContext(context);
  const resources = new MemoryResourceRepository();
  const eventBus = new CapturedEventBus();
  const clock = new FixedClock("2026-01-01T00:00:10.000Z");
  const logger = new NoopLogger();

  for (const resource of resourcesToSeed) {
    await resources.upsert(repositoryContext, resource, UpsertResourceSpec.fromResource(resource));
  }

  return {
    context,
    repositoryContext,
    resources,
    eventBus,
    useCase: new ConfigureResourceNetworkUseCase(resources, clock, eventBus, logger),
  };
}

describe("ConfigureResourceNetworkUseCase", () => {
  test("[RES-PROFILE-NETWORK-001] configures reverse-proxy network profile", async () => {
    const { context, eventBus, repositoryContext, resources, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      networkProfile: {
        internalPort: 3000,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
    });

    expect(result.isOk()).toBe(true);
    const persisted = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
    );
    const state = persisted?.toState();
    expect(state?.networkProfile?.internalPort.value).toBe(3000);
    expect(state?.networkProfile?.upstreamProtocol.value).toBe("http");
    expect(state?.networkProfile?.exposureMode.value).toBe("reverse-proxy");

    const event = configuredEvent(eventBus.events);
    expect(event.aggregateId).toBe("res_web");
    expect(event.payload).toMatchObject({
      resourceId: "res_web",
      projectId: "prj_demo",
      environmentId: "env_demo",
      internalPort: 3000,
      upstreamProtocol: "http",
      exposureMode: "reverse-proxy",
      configuredAt: "2026-01-01T00:00:10.000Z",
    });
  });

  test("[RES-PROFILE-NETWORK-003] rejects compose stacks without target service", async () => {
    const { context, eventBus, useCase } = await createHarness([composeStackResourceFixture()]);

    const result = await useCase.execute(context, {
      resourceId: "res_compose",
      networkProfile: {
        internalPort: 3000,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "resource-network-resolution",
        resourceId: "res_compose",
        resourceKind: "compose-stack",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });

  test("[RES-PROFILE-NETWORK-004] rejects direct-port while placement guards are absent", async () => {
    const { context, eventBus, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      networkProfile: {
        internalPort: 3000,
        upstreamProtocol: "http",
        exposureMode: "direct-port",
        hostPort: 8080,
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "resource-network-resolution",
        resourceId: "res_web",
        exposureMode: "direct-port",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });

  test("[RES-PROFILE-NETWORK-005] accepts shared internalPort for reverse-proxy resources", async () => {
    const { context, repositoryContext, resources, useCase } = await createHarness([
      applicationResourceFixture("res_web", "Web"),
      applicationResourceFixture("res_api", "Api"),
    ]);

    const first = await useCase.execute(context, {
      resourceId: "res_web",
      networkProfile: {
        internalPort: 3000,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
    });
    const second = await useCase.execute(context, {
      resourceId: "res_api",
      networkProfile: {
        internalPort: 3000,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
    });

    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
    const persisted = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_api")),
    );
    expect(persisted?.toState().networkProfile?.internalPort.value).toBe(3000);
  });

  test("[RES-PROFILE-NETWORK-006] rejects network changes for archived resources", async () => {
    const { context, eventBus, useCase } = await createHarness([
      archivedApplicationResourceFixture(),
    ]);

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      networkProfile: {
        internalPort: 3000,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "resource_archived",
      details: {
        phase: "resource-lifecycle-guard",
        resourceId: "res_web",
        commandName: "resources.configure-network",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });

  test("[RES-PROFILE-NETWORK-007] rejects missing resource without publishing event", async () => {
    const { context, eventBus, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      resourceId: "res_missing",
      networkProfile: {
        internalPort: 3000,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("not_found");
    expect(eventBus.events).toHaveLength(0);
  });

  test("[RES-PROFILE-NETWORK-002] rejects invalid network command input at schema boundary", () => {
    const command = ConfigureResourceNetworkCommand.create({
      resourceId: "res_web",
      networkProfile: {
        internalPort: Number.NaN,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
    });

    expect(command.isErr()).toBe(true);
    expect(command._unsafeUnwrapErr().code).toBe("validation_error");
  });
});
