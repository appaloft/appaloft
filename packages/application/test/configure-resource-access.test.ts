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
import { ConfigureResourceAccessCommand } from "../src/messages";
import { ConfigureResourceAccessUseCase } from "../src/use-cases";

function applicationResourceFixture(): Resource {
  return Resource.rehydrate({
    id: ResourceId.rehydrate("res_web"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    name: ResourceName.rehydrate("Web"),
    slug: ResourceSlug.rehydrate("web"),
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

function configuredEvent(events: unknown[]): DomainEvent {
  const event = events.find(
    (candidate): candidate is DomainEvent =>
      Boolean(candidate) &&
      typeof candidate === "object" &&
      (candidate as { type?: unknown }).type === "resource-access-configured",
  );

  if (!event) {
    throw new Error("resource-access-configured event was not captured");
  }

  return event;
}

async function createHarness(resourcesToSeed: Resource[] = [applicationResourceFixture()]) {
  const context = createExecutionContext({
    requestId: "req_configure_resource_access_test",
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
    useCase: new ConfigureResourceAccessUseCase(resources, clock, eventBus, logger),
  };
}

describe("ConfigureResourceAccessUseCase", () => {
  test("[RES-PROFILE-ACCESS-001] disables generated access for future resource routes", async () => {
    const { context, eventBus, repositoryContext, resources, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      accessProfile: {
        generatedAccessMode: "disabled",
        pathPrefix: "/internal",
      },
    });

    expect(result.isOk()).toBe(true);
    const persisted = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
    );
    const state = persisted?.toState();
    expect(state?.accessProfile?.generatedAccessMode.value).toBe("disabled");
    expect(state?.accessProfile?.pathPrefix.value).toBe("/internal");

    const event = configuredEvent(eventBus.events);
    expect(event.aggregateId).toBe("res_web");
    expect(event.payload).toMatchObject({
      resourceId: "res_web",
      projectId: "prj_demo",
      environmentId: "env_demo",
      generatedAccessMode: "disabled",
      pathPrefix: "/internal",
      configuredAt: "2026-01-01T00:00:10.000Z",
    });
  });

  test("[RES-PROFILE-ACCESS-002] defaults inherited generated access to root path prefix", async () => {
    const { context, repositoryContext, resources, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      accessProfile: {
        generatedAccessMode: "inherit",
      },
    });

    expect(result.isOk()).toBe(true);
    const persisted = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
    );
    const state = persisted?.toState();
    expect(state?.accessProfile?.generatedAccessMode.value).toBe("inherit");
    expect(state?.accessProfile?.pathPrefix.value).toBe("/");
  });

  test("[RES-PROFILE-ACCESS-004] rejects invalid access path prefixes with access phase details", async () => {
    const { context, eventBus, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      accessProfile: {
        generatedAccessMode: "inherit",
        pathPrefix: "docs",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "resource-access-resolution",
        field: "accessProfile.pathPrefix",
        resourceId: "res_web",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });

  test("[RES-PROFILE-ACCESS-005] rejects access changes for archived resources", async () => {
    const { context, eventBus, useCase } = await createHarness([
      archivedApplicationResourceFixture(),
    ]);

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      accessProfile: {
        generatedAccessMode: "disabled",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "resource_archived",
      details: {
        phase: "resource-lifecycle-guard",
        resourceId: "res_web",
        commandName: "resources.configure-access",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });

  test("[RES-PROFILE-ACCESS-004] rejects invalid access command input at schema boundary", () => {
    const command = ConfigureResourceAccessCommand.create({
      resourceId: "res_web",
      accessProfile: {
        generatedAccessMode: "available" as never,
      },
    });

    expect(command.isErr()).toBe(true);
    expect(command._unsafeUnwrapErr().code).toBe("validation_error");
  });
});
