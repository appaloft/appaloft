import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
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
import { ConfigureResourceRolloutUseCase, ConfigureResourceScaleUseCase } from "../src/use-cases";

async function harness() {
  const context = createExecutionContext({ requestId: "req_scale_rollout", entrypoint: "system" });
  const repositoryContext = toRepositoryContext(context);
  const resources = new MemoryResourceRepository();
  const resource = Resource.rehydrate({
    id: ResourceId.rehydrate("res_api"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    name: ResourceName.rehydrate("API"),
    slug: ResourceSlug.rehydrate("api"),
    kind: ResourceKindValue.rehydrate("application"),
    services: [],
    createdAt: CreatedAt.rehydrate("2026-08-13T00:00:00.000Z"),
  });
  await resources.upsert(repositoryContext, resource, UpsertResourceSpec.fromResource(resource));
  const clock = new FixedClock("2026-08-13T00:01:00.000Z");
  const eventBus = new CapturedEventBus();
  const logger = new NoopLogger();
  return {
    context,
    repositoryContext,
    resources,
    eventBus,
    scale: new ConfigureResourceScaleUseCase(resources, clock, eventBus, logger),
    rollout: new ConfigureResourceRolloutUseCase(resources, clock, eventBus, logger),
  };
}

describe("Resource scale and rollout operations", () => {
  test("[SCALE-PROFILE-009] configures and reads a portable scale profile", async () => {
    const testHarness = await harness();
    const result = await testHarness.scale.execute(testHarness.context, {
      resourceId: "res_api",
      scaleProfile: {
        replicas: 3,
        cpuRequestMillicores: 250,
        cpuLimitMillicores: 1000,
        memoryRequestMebibytes: 256,
        memoryLimitMebibytes: 512,
        horizontal: {
          minReplicas: 2,
          maxReplicas: 8,
          targetCpuUtilizationPercent: 70,
        },
      },
    });

    expect(result.isOk()).toBe(true);
    const persisted = await testHarness.resources.findOne(
      testHarness.repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate("res_api")),
    );
    expect(persisted?.toState().scaleProfile).toMatchObject({
      cpuRequestMillicores: 250,
      horizontal: { minReplicas: 2, maxReplicas: 8 },
    });
    expect(persisted?.toState().scaleProfile?.replicas.value).toBe(3);
    expect(testHarness.eventBus.events.map((event) => (event as { type: string }).type)).toContain(
      "resource-scale-profile-configured",
    );
  });

  test("[ROLLOUT-PROFILE-011] rejects canary without promotion gates", async () => {
    const testHarness = await harness();
    const result = await testHarness.rollout.execute(testHarness.context, {
      resourceId: "res_api",
      rolloutProfile: { strategy: "canary" },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().details).toMatchObject({
      phase: "resource-rollout-profile-validation",
      reason: "canary-policy-required",
    });
    expect(testHarness.eventBus.events).toHaveLength(0);
  });
});
