import { describe, expect, test } from "bun:test";

import {
  AliasText,
  CreatedAt,
  EnvironmentId,
  ResourceBinding,
  ResourceBindingId,
  ResourceBindingScopeValue,
  ResourceInjectionModeValue,
  ResourceInstanceId,
  WorkloadId,
} from "../src";

function binding(input?: {
  scope?: "environment" | "release" | "build-only" | "runtime-only";
  injectionMode?: "env" | "file" | "reference";
}) {
  return ResourceBinding.create({
    id: ResourceBindingId.rehydrate("rbd_demo"),
    workloadId: WorkloadId.rehydrate("wrk_demo"),
    resourceInstanceId: ResourceInstanceId.rehydrate("rsi_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    alias: AliasText.rehydrate("database"),
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
});
