import { describe, expect, test } from "bun:test";

import {
  CreatedAt,
  DependencyResourceSourceModeValue,
  EnvironmentId,
  ProjectId,
  ProviderKey,
  ResourceInstance,
  ResourceInstanceId,
  ResourceInstanceKindValue,
  ResourceInstanceName,
} from "../src";

describe("Redis dependency resource", () => {
  test("[DEP-RES-REDIS-PROVISION-001] creates provider-neutral Redis dependency resource", () => {
    const created = ResourceInstance.createRedisDependencyResource({
      id: ResourceInstanceId.rehydrate("rsi_redis"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      name: ResourceInstanceName.rehydrate("Cache"),
      kind: ResourceInstanceKindValue.rehydrate("redis"),
      sourceMode: DependencyResourceSourceModeValue.rehydrate("appaloft-managed"),
      providerKey: ProviderKey.rehydrate("appaloft-managed-redis"),
      providerManaged: true,
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    });

    expect(created.isOk()).toBe(true);
    const dependencyResource = created._unsafeUnwrap();
    expect(dependencyResource.toState()).toMatchObject({
      kind: expect.objectContaining({ value: "redis" }),
      providerManaged: true,
      bindingReadiness: {
        status: "not-implemented",
      },
    });
    expect(dependencyResource.pullDomainEvents()).toContainEqual(
      expect.objectContaining({
        type: "dependency-resource-created",
        aggregateId: "rsi_redis",
      }),
    );
  });

  test("[DEP-RES-REDIS-VALIDATION-001] rejects non-Redis kind", () => {
    const rejected = ResourceInstance.createRedisDependencyResource({
      id: ResourceInstanceId.rehydrate("rsi_redis"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      name: ResourceInstanceName.rehydrate("Cache"),
      kind: ResourceInstanceKindValue.rehydrate("postgres"),
      sourceMode: DependencyResourceSourceModeValue.rehydrate("appaloft-managed"),
      providerKey: ProviderKey.rehydrate("appaloft-managed-redis"),
      providerManaged: true,
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    });

    expect(rejected.isErr()).toBe(true);
    expect(rejected._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        field: "kind",
        phase: "dependency-resource-validation",
      },
    });
  });
});
