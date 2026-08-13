import { describe, expect, test } from "bun:test";

import {
  configureServerRuntimeTargetProfileInputSchema,
  configureServerRuntimeTargetProfileResponseSchema,
  runtimeTargetProfileSchema,
  serverSummarySchema,
} from "../src";

const profile = {
  schemaVersion: "runtime-target-profile/v1" as const,
  connectionReference: "file:///tmp/appaloft-r5a.kubeconfig",
  credentialReference: "secret://cluster/r5a",
  placementPolicyReference: "policy://placement/default",
};

describe("server runtime target profile contracts", () => {
  test("[K8S-PROFILE-001] configure and server readback share the opaque profile schema", () => {
    expect(
      configureServerRuntimeTargetProfileInputSchema.parse({
        serverId: "srv_r5a_cluster",
        connectionReference: profile.connectionReference,
        credentialReference: profile.credentialReference,
        placementPolicyReference: profile.placementPolicyReference,
      }),
    ).toEqual({
      serverId: "srv_r5a_cluster",
      connectionReference: profile.connectionReference,
      credentialReference: profile.credentialReference,
      placementPolicyReference: profile.placementPolicyReference,
    });

    expect(
      configureServerRuntimeTargetProfileResponseSchema.parse({
        profile,
        changed: true,
      }),
    ).toEqual({ profile, changed: true });

    const summary = serverSummarySchema.parse({
      id: "srv_r5a_cluster",
      name: "R5a cluster",
      host: "kubernetes.invalid",
      port: 6443,
      providerKey: "kubernetes",
      targetKind: "orchestrator-cluster",
      workloadRoles: [],
      lifecycleStatus: "active",
      runtimeTargetProfile: profile,
      createdAt: "2026-08-13T00:00:00.000Z",
    });
    expect(summary.runtimeTargetProfile).toEqual(profile);
  });

  test("[K8S-PROFILE-001] rejects raw kubeconfig, provider fields, and non-reference values", () => {
    expect(
      runtimeTargetProfileSchema.safeParse({
        ...profile,
        connectionReference: "apiVersion: v1\nclusters: []",
      }).success,
    ).toBe(false);
    expect(
      configureServerRuntimeTargetProfileInputSchema.safeParse({
        serverId: "srv_r5a_cluster",
        connectionReference: profile.connectionReference,
        kubeconfig: "inline-secret",
      }).success,
    ).toBe(false);
    expect(
      runtimeTargetProfileSchema.safeParse({
        ...profile,
        namespace: "caller-controlled",
      }).success,
    ).toBe(false);
  });
});
