import "reflect-metadata";
import { describe, expect, test } from "bun:test";

import {
  ApplyConnectorCapabilityUseCase,
  createExecutionContext,
  FakeInfrastructureConnectorProviderAdapter,
  InMemoryAcceptedConnectionCapabilityPlanStore,
  InMemoryConnectorProviderAdapterRegistry,
  InMemoryConnectorRegistry,
  PlanConnectorCapabilityQueryService,
} from "../src";

const ownerRef = { scope: "project" as const, id: "proj_state" };

function registry() {
  return new InMemoryConnectorRegistry([
    {
      key: "managed-kubernetes",
      title: "Managed Kubernetes",
      category: "infrastructure" as const,
      providerKey: "provider-a",
      capabilities: [
        "infrastructure.cluster.state-eligibility",
        "infrastructure.cluster.failover",
        "infrastructure.cluster.recover",
      ].map((key) => ({ key, title: key, implemented: true })),
      grantKinds: [],
      availability: { status: "available" as const, diagnostics: [] },
      visibility: "catalog" as const,
    },
  ]);
}

const placement = {
  targetPool: {
    poolId: "pool_state",
    targets: [
      {
        targetId: "target_ewr",
        providerKey: "provider-a",
        region: "ewr",
        failureDomains: [{ kind: "region", key: "provider-a:ewr" }],
        status: "ready",
        capabilities: ["kubernetes"],
        availableCapacity: 2,
        supportLevel: "standard",
      },
      {
        targetId: "target_sin",
        providerKey: "provider-a",
        region: "sin",
        failureDomains: [{ kind: "region", key: "provider-a:sin" }],
        status: "ready",
        capabilities: ["kubernetes"],
        availableCapacity: 2,
        supportLevel: "standard",
      },
    ],
  },
  placementIntent: {
    workloadRef: "resource:api",
    requiredCapabilities: ["kubernetes"],
    preferredRegions: ["sin"],
    excludedTargetIds: [],
    currentTargetId: "target_ewr",
    currentPlacementEpoch: 4,
    maxFailoverAttempts: 2,
    requiredFailureDomainKinds: ["region"],
  },
  mode: "failover",
  attempt: 1,
};

const restorableProfile = {
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
  },
};

describe("managed workload state eligibility connector", () => {
  test("[RESIL-STATE-007] plans typed eligibility without acceptance or apply", async () => {
    const adapter = new FakeInfrastructureConnectorProviderAdapter({
      connectorKey: "managed-kubernetes",
      providerKey: "provider-a",
      providerTitle: "Managed Kubernetes",
      now: () => "2026-08-14T12:10:00.000Z",
    });
    const adapters = new InMemoryConnectorProviderAdapterRegistry([adapter]);
    const planService = new PlanConnectorCapabilityQueryService(registry(), adapters);
    const applyService = new ApplyConnectorCapabilityUseCase(
      registry(),
      adapters,
      new InMemoryAcceptedConnectionCapabilityPlanStore(),
    );
    const context = createExecutionContext({ entrypoint: "system" });

    const plan = (
      await planService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.state-eligibility",
        ownerRef,
        parameters: { stateProfile: restorableProfile },
      })
    )._unsafeUnwrap();
    expect(plan).toMatchObject({
      riskLevel: "low",
      requiresExplicitAcceptance: false,
      cleanup: { supported: false },
      providerPlan: {
        kind: "managed-workload-state-eligibility",
        managedWorkloadStateEligibility: {
          status: "eligible",
          reasonCodes: ["state_restore_rehearsal_verified"],
        },
      },
    });
    expect(adapter.canApply("infrastructure.cluster.state-eligibility")).toBe(false);
    expect(
      (
        await applyService.execute(context, {
          connectorKey: "managed-kubernetes",
          capabilityKey: "infrastructure.cluster.state-eligibility",
          ownerRef,
          parameters: { stateProfile: restorableProfile },
        })
      ).isErr(),
    ).toBe(true);
  });

  test("[RESIL-STATE-007] binds failover to the exact eligible workload and target pair", async () => {
    const adapter = new FakeInfrastructureConnectorProviderAdapter({
      connectorKey: "managed-kubernetes",
      providerKey: "provider-a",
      providerTitle: "Managed Kubernetes",
      now: () => "2026-08-14T12:10:00.000Z",
    });
    const planService = new PlanConnectorCapabilityQueryService(
      registry(),
      new InMemoryConnectorProviderAdapterRegistry([adapter]),
    );
    const context = createExecutionContext({ entrypoint: "system" });
    const eligibilityPlan = (
      await planService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.state-eligibility",
        ownerRef,
        parameters: { stateProfile: restorableProfile },
      })
    )._unsafeUnwrap();
    const stateEligibility = eligibilityPlan.providerPlan?.managedWorkloadStateEligibility;

    expect(
      (
        await planService.execute(context, {
          connectorKey: "managed-kubernetes",
          capabilityKey: "infrastructure.cluster.failover",
          ownerRef,
          parameters: { ...placement, stateEligibility },
        })
      ).isOk(),
    ).toBe(true);

    for (const rejected of [
      undefined,
      { ...stateEligibility, workloadRef: "resource:other" },
      { ...stateEligibility, replacementTargetId: "target_other" },
      { ...stateEligibility, status: "blocked", reasonCodes: ["state_evidence_expired"] },
    ]) {
      const result = await planService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.failover",
        ownerRef,
        parameters: { ...placement, stateEligibility: rejected },
      });
      expect(result.isErr()).toBe(true);
    }
  });
});
