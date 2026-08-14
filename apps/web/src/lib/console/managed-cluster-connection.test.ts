import { describe, expect, test } from "vitest";

import {
  buildManagedClusterParameters,
  type ManagedClusterCapabilityKey,
  type ManagedClusterForm,
  managedClusterFormFingerprint,
} from "./managed-cluster-connection";

const baseForm: ManagedClusterForm = {
  clusterName: "appaloft-prod",
  clusterClass: "managed-standard",
  clusterRef: "cluster_appaloft_prod",
  workloadRef: "resource:api",
  requiredCapabilities: "kubernetes, helm, kubernetes",
  excludedTargetIds: "target_degraded",
  currentTargetId: "target_current",
  currentPlacementEpoch: "4",
  attempt: "1",
};

describe("managed cluster connection form", () => {
  test("[K8S-SURFACE-017] builds only provider-neutral provisioning parameters", () => {
    expect(buildManagedClusterParameters("infrastructure.cluster.provision", baseForm)).toEqual({
      ok: true,
      parameters: {
        clusterName: "appaloft-prod",
        clusterClass: "managed-standard",
        requiredCapabilities: ["helm", "kubernetes"],
      },
    });
  });

  test.each([
    "infrastructure.cluster.inspect",
    "infrastructure.cluster.delete",
    "infrastructure.cluster.cleanup-orphans",
  ] as const)("[K8S-SURFACE-017] builds %s with an opaque cluster reference", (capabilityKey) => {
    expect(buildManagedClusterParameters(capabilityKey, baseForm)).toEqual({
      ok: true,
      parameters: { clusterRef: "cluster_appaloft_prod" },
    });
  });

  test.each([
    ["infrastructure.cluster.place", "initial"],
    ["infrastructure.cluster.failover", "failover"],
    ["infrastructure.cluster.recover", "recovery"],
  ] as const)("[K8S-SURFACE-017] builds %s placement intent", (capabilityKey, mode) => {
    expect(buildManagedClusterParameters(capabilityKey, baseForm)).toEqual({
      ok: true,
      parameters: {
        workloadRef: "resource:api",
        requiredCapabilities: ["helm", "kubernetes"],
        excludedTargetIds: ["target_degraded"],
        currentTargetId: "target_current",
        currentPlacementEpoch: 4,
        mode,
        attempt: 1,
      },
    });
  });

  test("[RESIL-READY-004] builds an exact plan-only replacement readiness request", () => {
    expect(buildManagedClusterParameters("infrastructure.cluster.readiness", baseForm)).toEqual({
      ok: true,
      parameters: {
        workloadRef: "resource:api",
        requiredCapabilities: ["helm", "kubernetes"],
        excludedTargetIds: ["target_degraded"],
        currentTargetId: "target_current",
        currentPlacementEpoch: 4,
      },
    });
    expect(
      buildManagedClusterParameters("infrastructure.cluster.readiness", {
        ...baseForm,
        currentTargetId: " ",
      }),
    ).toEqual({ ok: false, field: "currentTargetId" });
  });

  test("[K8S-SURFACE-017] fails closed on missing or invalid actor input", () => {
    expect(
      buildManagedClusterParameters("infrastructure.cluster.provision", {
        ...baseForm,
        clusterName: " ",
      }),
    ).toEqual({ ok: false, field: "clusterName" });
    expect(
      buildManagedClusterParameters("infrastructure.cluster.failover", {
        ...baseForm,
        currentPlacementEpoch: "-1",
      }),
    ).toEqual({ ok: false, field: "currentPlacementEpoch" });
  });

  test("[K8S-SURFACE-017] fingerprints every plan-bound input", () => {
    const capabilityKey: ManagedClusterCapabilityKey = "infrastructure.cluster.failover";
    const before = managedClusterFormFingerprint(capabilityKey, baseForm);
    expect(managedClusterFormFingerprint(capabilityKey, { ...baseForm, attempt: "2" })).not.toBe(
      before,
    );
    expect(managedClusterFormFingerprint("infrastructure.cluster.recover", baseForm)).not.toBe(
      before,
    );
  });
});
