import { describe, expect, test } from "bun:test";

import { connectorCapabilityApplyResultSchema, connectorCapabilityPlanPreviewSchema } from "../src";

const placement = {
  poolId: "pool_prod",
  workloadRef: "resource:res_api",
  mode: "failover" as const,
  attempt: 1,
  selectedTargetId: "target_sin",
  selectedProviderKey: "provider-b",
  selectedRegion: "sin",
  previousTargetId: "target_ewr",
  placementEpoch: 5,
  fencingToken: "fence_12345678",
  rankedEligibleTargetIds: ["target_sin"],
  reasonCodes: ["region-rank:1", "tie-break:target-id"],
  consideredTargets: [
    { targetId: "target_ewr", eligible: false, reasons: ["failover:previous-target"] },
    { targetId: "target_sin", eligible: true, reasons: [] },
  ],
};

describe("managed cluster connector contracts", () => {
  test("[K8S-SURFACE-017] preserves typed placement evidence through plan responses", () => {
    const result = connectorCapabilityPlanPreviewSchema.parse({
      planId: "clusterplan_12345678",
      connectorKey: "managed-kubernetes",
      capabilityKey: "infrastructure.cluster.failover",
      riskLevel: "high",
      requiresExplicitAcceptance: true,
      summary: "Fail over resource:res_api",
      effects: [{ kind: "infrastructure.cluster.failover", title: "Fail over" }],
      cleanup: { supported: true },
      providerPlan: { kind: "managed-cluster-placement", managedClusterPlacement: placement },
    });

    expect(result.providerPlan?.managedClusterPlacement).toEqual(placement);
  });

  test("[K8S-SURFACE-017] preserves safe cost, support, fencing, and cleanup readback", () => {
    const result = connectorCapabilityApplyResultSchema.parse({
      operationId: "clusterop_12345678",
      connectorKey: "managed-kubernetes",
      capabilityKey: "infrastructure.cluster.failover",
      status: "verified",
      summary: "Failover verified",
      effects: [{ kind: "infrastructure.cluster.failover.ready", title: "Ready", managed: true }],
      providerResult: {
        kind: "managed-cluster-receipt",
        managedClusterReceipt: {
          operationId: "clusterop_12345678",
          action: "failover",
          providerKey: "provider-b",
          clusterRef: "resource:res_api",
          status: "ready",
          region: "sin",
          targetPoolId: "pool_prod",
          targetId: "target_sin",
          support: { level: "premium", reference: "support-plan-premium" },
          cost: { currency: "USD", estimatedMonthlyAmount: 180 },
          cleanup: { supported: true, residualOwnedResources: 0, orphanResourceRefs: [] },
          placement,
          credential: "must-not-survive-contract",
        },
      },
    });

    expect(result.providerResult?.managedClusterReceipt).toMatchObject({
      targetId: "target_sin",
      placement: { placementEpoch: 5, fencingToken: "fence_12345678" },
      cost: { currency: "USD", estimatedMonthlyAmount: 180 },
      support: { level: "premium" },
      cleanup: { residualOwnedResources: 0, orphanResourceRefs: [] },
    });
    expect(JSON.stringify(result)).not.toContain("must-not-survive-contract");
    expect(JSON.stringify(result)).not.toContain("credential");
  });
});
