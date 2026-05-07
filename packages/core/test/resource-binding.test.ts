import { describe, expect, test } from "bun:test";

import {
  CreatedAt,
  EnvironmentId,
  ProjectId,
  ResourceBinding,
  ResourceBindingId,
  ResourceBindingScopeValue,
  ResourceBindingSecretRef,
  ResourceBindingSecretVersion,
  ResourceBindingTargetName,
  ResourceId,
  ResourceInjectionModeValue,
  ResourceInstanceId,
  UpdatedAt,
} from "../src";

function binding(input?: {
  scope?: "environment" | "release" | "build-only" | "runtime-only";
  injectionMode?: "env" | "file" | "reference";
}) {
  return ResourceBinding.create({
    id: ResourceBindingId.rehydrate("rbd_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    resourceId: ResourceId.rehydrate("res_web"),
    resourceInstanceId: ResourceInstanceId.rehydrate("rsi_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    targetName: ResourceBindingTargetName.rehydrate("DATABASE_URL"),
    scope: ResourceBindingScopeValue.rehydrate(input?.scope ?? "runtime-only"),
    injectionMode: ResourceInjectionModeValue.rehydrate(input?.injectionMode ?? "reference"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

describe("ResourceBinding", () => {
  test("[DMBH-BINDING-001] coordinates scope and injection mode coherence", () => {
    const runtimeReference = binding();
    const buildReference = binding({ scope: "build-only", injectionMode: "reference" });
    const buildEnv = binding({ scope: "build-only", injectionMode: "env" });

    expect(ResourceBindingScopeValue.rehydrate("build-only").isBuildOnly()).toBe(true);
    expect(ResourceInjectionModeValue.rehydrate("reference").isRuntimeReference()).toBe(true);
    expect(runtimeReference.isOk()).toBe(true);
    expect(runtimeReference._unsafeUnwrap().canUseInjectionMode()).toBe(true);
    expect(buildReference.isErr()).toBe(true);
    expect(buildReference._unsafeUnwrapErr().message).toBe(
      "Build-only resource bindings cannot use runtime references",
    );
    expect(buildEnv.isOk()).toBe(true);
    expect(buildEnv._unsafeUnwrap().canUseInjectionMode()).toBe(true);
  });

  test("[DEP-BIND-PG-BIND-001] [DEP-BIND-PG-UNBIND-001] creates and removes an active Resource dependency binding", () => {
    const created = binding({ injectionMode: "env" })._unsafeUnwrap();

    expect(created.isActive()).toBe(true);
    expect(created.toState().targetName.value).toBe("DATABASE_URL");
    expect(created.pullDomainEvents()).toContainEqual(
      expect.objectContaining({
        type: "resource-dependency-bound",
        aggregateId: "rbd_demo",
      }),
    );

    const unbound = created.unbind({
      removedAt: UpdatedAt.rehydrate("2026-01-01T00:01:00.000Z"),
    });

    expect(unbound.isOk()).toBe(true);
    expect(created.isActive()).toBe(false);
    expect(created.pullDomainEvents()).toContainEqual(
      expect.objectContaining({
        type: "resource-dependency-unbound",
        aggregateId: "rbd_demo",
      }),
    );
  });

  test("[DEP-BIND-PG-BIND-004] matches duplicate active binding target", () => {
    const created = binding({ injectionMode: "env" })._unsafeUnwrap();

    expect(
      created.matchesActiveTarget({
        resourceId: ResourceId.rehydrate("res_web"),
        resourceInstanceId: ResourceInstanceId.rehydrate("rsi_demo"),
        targetName: ResourceBindingTargetName.rehydrate("DATABASE_URL"),
      }),
    ).toBe(true);
  });

  test("[DEP-BIND-ROTATE-001] rotates active binding secret metadata", () => {
    const created = binding({ injectionMode: "env" })._unsafeUnwrap();

    const rotated = created.rotateSecret({
      secretRef: ResourceBindingSecretRef.rehydrate("secret://dependency-binding/rbd_demo/current"),
      secretVersion: ResourceBindingSecretVersion.rehydrate("rbsv_0001"),
      rotatedAt: UpdatedAt.rehydrate("2026-01-01T00:02:00.000Z"),
    });

    expect(rotated.isOk()).toBe(true);
    expect(created.toState()).toMatchObject({
      secretRef: expect.objectContaining({ value: "secret://dependency-binding/rbd_demo/current" }),
      secretVersion: expect.objectContaining({ value: "rbsv_0001" }),
      secretRotatedAt: expect.objectContaining({ value: "2026-01-01T00:02:00.000Z" }),
    });
    expect(created.pullDomainEvents()).toContainEqual(
      expect.objectContaining({
        type: "resource-dependency-binding-secret-rotated",
        aggregateId: "rbd_demo",
      }),
    );
  });

  test("[DEP-BIND-ROTATE-002] rejects secret rotation after unbind", () => {
    const created = binding({ injectionMode: "env" })._unsafeUnwrap();
    created
      .unbind({
        removedAt: UpdatedAt.rehydrate("2026-01-01T00:01:00.000Z"),
      })
      ._unsafeUnwrap();

    const rejected = created.rotateSecret({
      secretRef: ResourceBindingSecretRef.rehydrate("secret://dependency-binding/rbd_demo/current"),
      secretVersion: ResourceBindingSecretVersion.rehydrate("rbsv_0001"),
      rotatedAt: UpdatedAt.rehydrate("2026-01-01T00:02:00.000Z"),
    });

    expect(rejected.isErr()).toBe(true);
    expect(rejected._unsafeUnwrapErr()).toMatchObject({
      code: "resource_dependency_binding_rotation_blocked",
      details: {
        blockerReasonCode: "binding_not_active",
        currentBindingState: "removed",
      },
    });
  });
});
