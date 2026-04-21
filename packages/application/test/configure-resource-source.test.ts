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
import { ConfigureResourceSourceUseCase } from "../src/use-cases";

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
      (candidate as { type?: unknown }).type === "resource-source-configured",
  );

  if (!event) {
    throw new Error("resource-source-configured event was not captured");
  }

  return event;
}

async function createHarness(resource: Resource = applicationResourceFixture()) {
  const context = createExecutionContext({
    requestId: "req_configure_resource_source_test",
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
    useCase: new ConfigureResourceSourceUseCase(resources, clock, eventBus, logger),
  };
}

describe("ConfigureResourceSourceUseCase", () => {
  test("[RES-PROFILE-SOURCE-001] configures a Git source binding", async () => {
    const { context, eventBus, repositoryContext, resources, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      source: {
        kind: "git-public",
        locator: "https://github.com/acme/web.git",
        displayName: "acme/web",
        gitRef: "main",
        baseDirectory: "/apps/web",
      },
    });

    expect(result.isOk()).toBe(true);
    const persisted = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
    );
    const sourceBinding = persisted?.toState().sourceBinding;
    expect(sourceBinding?.kind.value).toBe("git-public");
    expect(sourceBinding?.locator.value).toBe("https://github.com/acme/web.git");
    expect(sourceBinding?.displayName.value).toBe("acme/web");
    expect(sourceBinding?.gitRef?.value).toBe("main");
    expect(sourceBinding?.baseDirectory?.value).toBe("/apps/web");

    const event = configuredEvent(eventBus.events);
    expect(event.aggregateId).toBe("res_web");
    expect(event.payload).toMatchObject({
      resourceId: "res_web",
      projectId: "prj_demo",
      environmentId: "env_demo",
      sourceKind: "git-public",
      sourceLocator: "https://github.com/acme/web.git",
      configuredAt: "2026-01-01T00:00:10.000Z",
    });
  });

  test("[RES-PROFILE-SOURCE-002] rejects ambiguous GitHub tree URLs", async () => {
    const { context, eventBus, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      source: {
        kind: "git-public",
        locator: "https://github.com/acme/web/tree/main/apps/web",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "resource-source-resolution",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });

  test("accepts absolute local-folder source locators", async () => {
    const { context, eventBus, repositoryContext, resources, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      source: {
        kind: "local-folder",
        locator: "/tmp/appaloft/workspace-http-app",
      },
    });

    expect(result.isOk()).toBe(true);
    const persisted = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
    );
    expect(persisted?.toState().sourceBinding?.kind.value).toBe("local-folder");
    expect(persisted?.toState().sourceBinding?.locator.value).toBe(
      "/tmp/appaloft/workspace-http-app",
    );

    const event = configuredEvent(eventBus.events);
    expect(event.payload).toMatchObject({
      resourceId: "res_web",
      sourceKind: "local-folder",
      sourceLocator: "/tmp/appaloft/workspace-http-app",
    });
  });

  test("[RES-PROFILE-SOURCE-003] rejects Docker image tag and digest conflicts", async () => {
    const { context, eventBus, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      source: {
        kind: "docker-image",
        locator: "ghcr.io/acme/web",
        imageTag: "latest",
        imageDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "resource-source-resolution",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });

  test("[RES-PROFILE-SOURCE-004] rejects source fields containing secret material", async () => {
    const { context, eventBus, useCase } = await createHarness();
    const secretValue = "ghp_secret_token_value";

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      source: {
        kind: "git-public",
        locator: "https://github.com/acme/web.git",
        metadata: {
          accessToken: secretValue,
        },
      },
    });

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error).toMatchObject({
      code: "validation_error",
      details: {
        phase: "resource-source-resolution",
        field: "source.metadata.accessToken",
      },
    });
    expect(JSON.stringify(error)).not.toContain(secretValue);
    expect(eventBus.events).toHaveLength(0);
  });

  test("[RES-PROFILE-SOURCE-005] rejects source changes for archived resources", async () => {
    const { context, eventBus, useCase } = await createHarness(
      archivedApplicationResourceFixture(),
    );

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      source: {
        kind: "git-public",
        locator: "https://github.com/acme/web.git",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "resource_archived",
      details: {
        phase: "resource-lifecycle-guard",
        resourceId: "res_web",
        commandName: "resources.configure-source",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });
});
