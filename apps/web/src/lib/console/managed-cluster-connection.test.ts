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
  routeRef: "route:api.example.com",
  currentEndpointRef: "endpoint:ewr",
  replacementEndpointRef: "endpoint:sin",
  replacementTargetId: "target_sin",
  currentFencingToken: "fence_epoch_4",
  nextFencingToken: "fence_epoch_5",
  healthProofRef: "health-proof:sin:42",
  healthObservedAt: "2026-08-14T12:00:00.000Z",
  healthValidUntil: "2026-08-14T12:05:00.000Z",
  plannedAt: "2026-08-14T12:01:00.000Z",
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

  test("[RESIL-CELL-010] builds provider-neutral import and drain parameters", () => {
    expect(buildManagedClusterParameters("infrastructure.cluster.import", baseForm)).toEqual({
      ok: true,
      parameters: {
        clusterRef: "cluster_appaloft_prod",
        clusterName: "appaloft-prod",
        clusterClass: "managed-standard",
        requiredCapabilities: ["helm", "kubernetes"],
      },
    });
    expect(buildManagedClusterParameters("infrastructure.cluster.drain", baseForm)).toEqual({
      ok: true,
      parameters: { clusterRef: "cluster_appaloft_prod" },
    });
  });

  test.each([
    "infrastructure.cluster.inspect",
    "infrastructure.cluster.drain",
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

  test("[RESIL-FENCE-005][RESIL-ROUTE-006] builds exact safe handoff and plan-only status parameters", () => {
    expect(
      buildManagedClusterParameters("infrastructure.cluster.handoff-traffic", baseForm),
    ).toEqual({
      ok: true,
      parameters: {
        action: "handoff",
        currentRoute: {
          routeRef: "route:api.example.com",
          workloadRef: "resource:api",
          activeEndpointRef: "endpoint:ewr",
          activeTargetId: "target_current",
          placementEpoch: 4,
          fencingToken: "fence_epoch_4",
        },
        currentEndpoint: {
          endpointRef: "endpoint:ewr",
          workloadRef: "resource:api",
          targetId: "target_current",
        },
        replacementEndpoint: {
          endpointRef: "endpoint:sin",
          workloadRef: "resource:api",
          targetId: "target_sin",
        },
        replacementHealth: {
          endpointRef: "endpoint:sin",
          status: "healthy",
          observedAt: "2026-08-14T12:00:00.000Z",
          validUntil: "2026-08-14T12:05:00.000Z",
          proofRef: "health-proof:sin:42",
        },
        nextPlacementEpoch: 5,
        nextFencingToken: "fence_epoch_5",
        rollbackEndpointRef: "endpoint:ewr",
        plannedAt: "2026-08-14T12:01:00.000Z",
      },
    });
    expect(
      buildManagedClusterParameters("infrastructure.cluster.traffic-status", baseForm),
    ).toEqual({ ok: true, parameters: { routeRef: "route:api.example.com" } });
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
