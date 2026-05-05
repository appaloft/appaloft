import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DisplayNameText,
  EnvironmentId,
  GitRefText,
  ProjectId,
  Resource,
  ResourceByIdSpec,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  ResourceSlug,
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
import { ConfigureResourceAutoDeployUseCase } from "../src/use-cases";

function resourceFixture(input: { sourceBinding?: boolean } = {}): Resource {
  return Resource.rehydrate({
    id: ResourceId.rehydrate("res_web"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    name: ResourceName.rehydrate("Web"),
    slug: ResourceSlug.rehydrate("web"),
    kind: ResourceKindValue.rehydrate("application"),
    services: [],
    ...(input.sourceBinding
      ? {
          sourceBinding: {
            kind: SourceKindValue.rehydrate("git-public"),
            locator: SourceLocator.rehydrate("https://github.com/appaloft/demo"),
            displayName: DisplayNameText.rehydrate("appaloft/demo"),
            gitRef: GitRefText.rehydrate("main"),
          },
        }
      : {}),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

async function createHarness(resource: Resource = resourceFixture({ sourceBinding: true })) {
  const context = createExecutionContext({
    requestId: "req_configure_resource_auto_deploy_test",
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
    eventBus,
    repositoryContext,
    resources,
    useCase: new ConfigureResourceAutoDeployUseCase(resources, clock, eventBus, logger),
  };
}

describe("ConfigureResourceAutoDeployUseCase", () => {
  test("[SRC-AUTO-POLICY-001] enables Resource-owned auto-deploy policy", async () => {
    const { context, eventBus, repositoryContext, resources, useCase } = await createHarness();

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      mode: "enable",
      policy: {
        triggerKind: "git-push",
        refs: ["main"],
        eventKinds: ["push"],
      },
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      resourceId: "res_web",
      status: "enabled",
      triggerKind: "git-push",
      refs: ["main"],
      eventKinds: ["push"],
    });
    const persisted = await resources.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_web")),
    );
    expect(persisted?.toState().autoDeployPolicy?.status.value).toBe("enabled");
    expect(eventBus.events.map((event) => (event as { type?: string }).type)).toContain(
      "resource-auto-deploy-policy-configured",
    );
  });

  test("[SRC-AUTO-POLICY-002] rejects policy when Resource has no compatible source binding", async () => {
    const { context, eventBus, useCase } = await createHarness(resourceFixture());

    const result = await useCase.execute(context, {
      resourceId: "res_web",
      mode: "enable",
      policy: {
        triggerKind: "git-push",
        refs: ["main"],
        eventKinds: ["push"],
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "resource_auto_deploy_source_missing",
      details: {
        phase: "auto-deploy-policy-admission",
        resourceId: "res_web",
      },
    });
    expect(eventBus.events).toHaveLength(0);
  });
});
