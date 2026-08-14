import { describe, expect, test } from "bun:test";

import {
  connectorCapabilityApplyResultSchema,
  connectorCapabilityPlanPreviewSchema,
  managedCapacityCellSchema,
  managedClusterPlacementIntentSchema,
  managedClusterReplacementReadinessSchema,
  managedClusterTargetPoolSchema,
  managedWorkloadStateEligibilitySchema,
} from "../src";

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
  test("[RESIL-CELL-010] preserves only the safe managed capacity-cell snapshot", () => {
    const cell = managedCapacityCellSchema.parse({
      clusterRef: "cluster:customer-regional-b",
      targetId: "target_regional_b",
      targetPoolId: "pool_production",
      providerKey: "digitalocean",
      clusterName: "regional-b",
      region: "sfo3",
      failureDomains: [
        { kind: "provider", key: "digitalocean" },
        { kind: "region", key: "digitalocean:sfo3" },
      ],
      origin: "imported",
      lifecycleStatus: "drained",
      providerResourceDisposition: "retain",
      capabilities: ["kubernetes"],
      availableCapacity: 0,
      activePlacementCount: 0,
      estimatedMonthlyCostUsd: 48,
      supportLevel: "community",
      credentialRef: "secret:do-token",
      providerBindingRef: "binding:private",
      providerObject: { id: "raw-provider-id" },
    });

    expect(cell).toMatchObject({
      origin: "imported",
      lifecycleStatus: "drained",
      providerResourceDisposition: "retain",
      failureDomains: [{ kind: "provider" }, { kind: "region" }],
      activePlacementCount: 0,
    });
    expect(JSON.stringify(cell)).not.toContain("secret:do-token");
    expect(JSON.stringify(cell)).not.toContain("binding:private");
    expect(JSON.stringify(cell)).not.toContain("raw-provider-id");
  });

  test("[RESIL-FD-001] preserves failure-domain identities and placement requirements", () => {
    const pool = managedClusterTargetPoolSchema.parse({
      poolId: "pool_prod",
      targets: [
        {
          targetId: "target_sin",
          providerKey: "provider-b",
          region: "sin",
          failureDomains: [
            { kind: "provider", key: "provider-b" },
            { kind: "region", key: "provider-b:sin" },
          ],
          status: "ready",
          capabilities: ["kubernetes"],
          availableCapacity: 3,
          supportLevel: "premium",
        },
      ],
    });
    const intent = managedClusterPlacementIntentSchema.parse({
      workloadRef: "resource:res_api",
      requiredCapabilities: ["kubernetes"],
      preferredRegions: ["sin"],
      excludedTargetIds: [],
      currentPlacementEpoch: 4,
      maxFailoverAttempts: 2,
      requiredFailureDomainKinds: ["provider", "region"],
    });

    expect(pool.targets[0]?.failureDomains).toEqual([
      { kind: "provider", key: "provider-b" },
      { kind: "region", key: "provider-b:sin" },
    ]);
    expect(intent.requiredFailureDomainKinds).toEqual(["provider", "region"]);
  });

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

  test("[RESIL-READY-004] preserves typed replacement readiness without mutation fields", () => {
    const readiness = managedClusterReplacementReadinessSchema.parse({
      poolId: "pool_prod",
      workloadRef: "resource:res_api",
      currentTargetId: "target_ewr",
      currentPlacementEpoch: 4,
      status: "ready",
      requiredCapabilities: ["kubernetes"],
      requiredFailureDomainKinds: ["provider"],
      selectedTargetId: "target_sin",
      selectedProviderKey: "provider-b",
      selectedRegion: "sin",
      selectedFailureDomains: [{ kind: "provider", key: "provider-b" }],
      selectedEstimatedMonthlyCostUsd: 120,
      selectedSupportLevel: "premium",
      eligibleReplacementTargetIds: ["target_sin"],
      totalEligibleReplacementCapacity: 3,
      reasonCodes: ["replacement:ready", "failure-domain:provider:separated"],
      consideredTargets: [
        {
          targetId: "target_ewr",
          eligible: false,
          availableCapacity: 2,
          reasons: ["failover:previous-target"],
        },
        {
          targetId: "target_sin",
          eligible: true,
          availableCapacity: 3,
          reasons: [],
        },
      ],
      placementEpoch: 5,
      fencingToken: "must-not-survive-contract",
      credential: "must-not-survive-contract",
    });
    const preview = connectorCapabilityPlanPreviewSchema.parse({
      planId: "clusterplan_readiness",
      connectorKey: "managed-kubernetes",
      capabilityKey: "infrastructure.cluster.readiness",
      riskLevel: "low",
      requiresExplicitAcceptance: false,
      summary: "Replacement ready",
      effects: [{ kind: "infrastructure.cluster.readiness", title: "Ready" }],
      providerPlan: {
        kind: "managed-cluster-replacement-readiness",
        managedClusterReplacementReadiness: readiness,
      },
    });

    expect(preview.providerPlan?.managedClusterReplacementReadiness).toEqual(readiness);
    expect(JSON.stringify(preview)).not.toContain("fencingToken");
    expect(JSON.stringify(preview)).not.toContain("credential");
    expect(JSON.stringify(preview)).not.toContain("must-not-survive-contract");
  });

  test("[RESIL-STATE-007] preserves safe typed state eligibility and strips private fields", () => {
    const eligibility = managedWorkloadStateEligibilitySchema.parse({
      workloadRef: "resource:api",
      currentTargetId: "target_ewr",
      replacementTargetId: "target_sin",
      mode: "restorable",
      objectives: {
        maximumRecoveryPointAgeSeconds: 300,
        maximumRecoveryTimeSeconds: 600,
      },
      evidence: {
        kind: "restore-rehearsal",
        backupEvidenceRef: "backup:svb_20260814",
        restoreEvidenceRef: "restore:sra_20260814",
        sourceTargetId: "target_ewr",
        recoveryTargetId: "target_sin",
        observedAt: "2026-08-14T12:00:00.000Z",
        validUntil: "2026-08-14T13:00:00.000Z",
        observedRecoveryPointAgeSeconds: 120,
        observedRecoveryTimeSeconds: 240,
        credential: "must-not-survive-contract",
        providerObject: { id: "raw-backup-object" },
      },
      status: "eligible",
      evaluatedAt: "2026-08-14T12:10:00.000Z",
      reasonCodes: ["state_restore_rehearsal_verified"],
      credential: "must-not-survive-contract",
    });
    const preview = connectorCapabilityPlanPreviewSchema.parse({
      planId: "stateplan_12345678",
      connectorKey: "managed-kubernetes",
      capabilityKey: "infrastructure.cluster.state-eligibility",
      riskLevel: "low",
      requiresExplicitAcceptance: false,
      summary: "State is eligible",
      effects: [{ kind: "infrastructure.cluster.state-eligibility", title: "Eligible" }],
      cleanup: { supported: false },
      providerPlan: {
        kind: "managed-workload-state-eligibility",
        managedWorkloadStateEligibility: eligibility,
      },
    });

    expect(preview.providerPlan?.managedWorkloadStateEligibility).toEqual(eligibility);
    expect(JSON.stringify(preview)).not.toContain("must-not-survive-contract");
    expect(JSON.stringify(preview)).not.toContain("raw-backup-object");
  });
});
