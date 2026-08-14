import "reflect-metadata";
import { describe, expect, test } from "bun:test";

import {
  AcceptConnectorCapabilityPlanUseCase,
  ApplyConnectorCapabilityUseCase,
  createExecutionContext,
  FakeInfrastructureConnectorProviderAdapter,
  InMemoryAcceptedConnectionCapabilityPlanStore,
  InMemoryConnectorProviderAdapterRegistry,
  InMemoryConnectorRegistry,
  PlanConnectorCapabilityQueryService,
} from "../src";

const ownerRef = { scope: "project" as const, id: "proj_managed" };

function managedConnectorDefinition() {
  return {
    key: "managed-kubernetes",
    title: "Managed Kubernetes",
    category: "infrastructure" as const,
    providerKey: "provider-a",
    capabilities: [
      "infrastructure.cluster.provision",
      "infrastructure.cluster.inspect",
      "infrastructure.cluster.delete",
      "infrastructure.cluster.place",
      "infrastructure.cluster.failover",
      "infrastructure.cluster.recover",
      "infrastructure.cluster.cleanup-orphans",
    ].map((key) => ({ key, title: key, implemented: true })),
    grantKinds: [
      {
        kind: "persistent-provider-credential" as const,
        title: "Managed provider credential",
        storesLongLivedSecret: true,
      },
    ],
    availability: { status: "available" as const, diagnostics: [] },
    visibility: "catalog" as const,
  };
}

async function acceptedPlan(input: {
  store: InMemoryAcceptedConnectionCapabilityPlanStore;
  plan: {
    planId: string;
    connectorKey: string;
    capabilityKey: string;
    riskLevel: "low" | "medium" | "high";
    summary: string;
    effects: { kind: string; title: string; description?: string }[];
    cleanup?: { supported: boolean; description?: string };
  };
}) {
  return new AcceptConnectorCapabilityPlanUseCase(input.store)
    .execute(
      createExecutionContext({
        entrypoint: "system",
        actor: { kind: "user", id: "actor_owner" },
      }),
      {
        ...input.plan,
        ownerRef,
        acceptedBy: "actor_owner",
      },
    )
    .then((result) => result._unsafeUnwrap());
}

describe("managed cluster connector protocol", () => {
  test("[K8S-MANAGED-016] fails before provider effects when acceptance is missing or parameters drift", async () => {
    const registry = new InMemoryConnectorRegistry([managedConnectorDefinition()]);
    const adapter = new FakeInfrastructureConnectorProviderAdapter({
      connectorKey: "managed-kubernetes",
      providerKey: "provider-a",
      providerTitle: "Managed Kubernetes",
    });
    const adapters = new InMemoryConnectorProviderAdapterRegistry([adapter]);
    const acceptedStore = new InMemoryAcceptedConnectionCapabilityPlanStore();
    const planService = new PlanConnectorCapabilityQueryService(registry, adapters);
    const applyService = new ApplyConnectorCapabilityUseCase(registry, adapters, acceptedStore);
    const context = createExecutionContext({ entrypoint: "system" });
    const parameters = {
      clusterName: "appaloft-prod",
      region: "ewr",
      clusterClass: "standard-3",
      targetPoolId: "pool_prod",
      estimatedMonthlyCostUsd: 180,
      supportLevel: "premium",
      requiredCapabilities: ["kubernetes"],
    };
    const plan = (
      await planService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.provision",
        ownerRef,
        parameters,
      })
    )._unsafeUnwrap();

    const missingAcceptance = await applyService.execute(context, {
      connectorKey: "managed-kubernetes",
      capabilityKey: "infrastructure.cluster.provision",
      ownerRef,
      parameters,
    });
    expect(missingAcceptance.isErr()).toBe(true);
    expect(missingAcceptance._unsafeUnwrapErr().code).toBe("conflict");

    const accepted = await acceptedPlan({ store: acceptedStore, plan });
    const drifted = await applyService.execute(context, {
      connectorKey: "managed-kubernetes",
      capabilityKey: "infrastructure.cluster.provision",
      ownerRef,
      acceptedPlanId: accepted.acceptedPlanId,
      parameters: { ...parameters, estimatedMonthlyCostUsd: 240 },
    });
    expect(drifted.isErr()).toBe(true);
    expect(drifted._unsafeUnwrapErr().code).toBe("conflict");
  });

  test("[K8S-MANAGED-016] plans, provisions, inspects, and deletes with typed safe receipts", async () => {
    const registry = new InMemoryConnectorRegistry([managedConnectorDefinition()]);
    const adapter = new FakeInfrastructureConnectorProviderAdapter({
      connectorKey: "managed-kubernetes",
      providerKey: "provider-a",
      providerTitle: "Managed Kubernetes",
    });
    const adapters = new InMemoryConnectorProviderAdapterRegistry([adapter]);
    const acceptedStore = new InMemoryAcceptedConnectionCapabilityPlanStore();
    const planService = new PlanConnectorCapabilityQueryService(registry, adapters);
    const applyService = new ApplyConnectorCapabilityUseCase(registry, adapters, acceptedStore);
    const context = createExecutionContext({ entrypoint: "system" });

    const provisionPlan = (
      await planService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.provision",
        ownerRef,
        parameters: {
          clusterName: "appaloft-prod",
          region: "ewr",
          clusterClass: "standard-3",
          targetPoolId: "pool_prod",
          estimatedMonthlyCostUsd: 180,
          supportLevel: "premium",
          requiredCapabilities: ["kubernetes", "stateful", "helm"],
        },
      })
    )._unsafeUnwrap();

    expect(provisionPlan).toMatchObject({
      capabilityKey: "infrastructure.cluster.provision",
      riskLevel: "high",
      requiresExplicitAcceptance: true,
      cleanup: { supported: true },
      providerPlan: {
        kind: "managed-cluster-capability-plan",
        managedClusterPlan: {
          action: "provision",
          providerKey: "provider-a",
          clusterName: "appaloft-prod",
          region: "ewr",
          clusterClass: "standard-3",
          targetPoolId: "pool_prod",
          estimatedMonthlyCostUsd: 180,
          currency: "USD",
          supportLevel: "premium",
          cleanupSupported: true,
          requiredCapabilities: ["helm", "kubernetes", "stateful"],
        },
      },
    });
    expect(JSON.stringify(provisionPlan)).not.toContain("credential");
    expect(JSON.stringify(provisionPlan)).not.toContain("token");

    const acceptedProvision = await acceptedPlan({ store: acceptedStore, plan: provisionPlan });
    const provisioned = (
      await applyService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.provision",
        ownerRef,
        acceptedPlanId: acceptedProvision.acceptedPlanId,
        parameters: { ...(provisionPlan.providerPlan?.managedClusterPlan ?? {}) },
      })
    )._unsafeUnwrap();
    const clusterRef = provisioned.providerResult?.managedClusterReceipt?.clusterRef;

    expect(provisioned).toMatchObject({
      status: "applied",
      providerResult: {
        kind: "managed-cluster-receipt",
        managedClusterReceipt: {
          action: "provision",
          providerKey: "provider-a",
          clusterRef: expect.stringMatching(/^cluster_/),
          status: "ready",
          region: "ewr",
          targetPoolId: "pool_prod",
          support: { level: "premium" },
          cost: { currency: "USD", estimatedMonthlyAmount: 180 },
          cleanup: { supported: true, residualOwnedResources: 0, orphanResourceRefs: [] },
        },
      },
    });
    expect(clusterRef).toBeTruthy();

    const inspected = (
      await planService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.inspect",
        ownerRef,
        parameters: { clusterRef },
      })
    )._unsafeUnwrap();
    expect(inspected).toMatchObject({
      requiresExplicitAcceptance: false,
      providerPlan: {
        kind: "managed-cluster-readback",
        managedClusterReceipt: {
          clusterRef,
          status: "ready",
        },
      },
    });

    const orphanCleanupPlan = (
      await planService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.cleanup-orphans",
        ownerRef,
        parameters: { clusterRef },
      })
    )._unsafeUnwrap();
    const acceptedOrphanCleanup = await acceptedPlan({
      store: acceptedStore,
      plan: orphanCleanupPlan,
    });
    const orphanCleanup = (
      await applyService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.cleanup-orphans",
        ownerRef,
        acceptedPlanId: acceptedOrphanCleanup.acceptedPlanId,
        parameters: { clusterRef },
      })
    )._unsafeUnwrap();
    expect(orphanCleanup).toMatchObject({
      status: "cleaned-up",
      providerResult: {
        managedClusterReceipt: {
          action: "cleanup-orphans",
          clusterRef,
          status: "ready",
          cleanup: { residualOwnedResources: 0, orphanResourceRefs: [] },
        },
      },
    });

    const deletePlan = (
      await planService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.delete",
        ownerRef,
        parameters: { clusterRef },
      })
    )._unsafeUnwrap();
    const acceptedDelete = await acceptedPlan({ store: acceptedStore, plan: deletePlan });
    const deleted = (
      await applyService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.delete",
        ownerRef,
        acceptedPlanId: acceptedDelete.acceptedPlanId,
        parameters: { clusterRef },
      })
    )._unsafeUnwrap();
    expect(deleted).toMatchObject({
      status: "cleaned-up",
      providerResult: {
        managedClusterReceipt: {
          clusterRef,
          status: "deleted",
          cleanup: { residualOwnedResources: 0, orphanResourceRefs: [] },
        },
      },
    });

    const missing = await planService.execute(context, {
      connectorKey: "managed-kubernetes",
      capabilityKey: "infrastructure.cluster.inspect",
      ownerRef,
      parameters: { clusterRef },
    });
    expect(missing.isErr()).toBe(true);
    expect(missing._unsafeUnwrapErr().code).toBe("not_found");
  });

  test("[K8S-MULTI-015][K8S-MANAGED-016] plans and applies deterministic failover with fencing", async () => {
    const registry = new InMemoryConnectorRegistry([managedConnectorDefinition()]);
    const adapter = new FakeInfrastructureConnectorProviderAdapter({
      connectorKey: "managed-kubernetes",
      providerKey: "provider-a",
      providerTitle: "Managed Kubernetes",
    });
    const adapters = new InMemoryConnectorProviderAdapterRegistry([adapter]);
    const acceptedStore = new InMemoryAcceptedConnectionCapabilityPlanStore();
    const planService = new PlanConnectorCapabilityQueryService(registry, adapters);
    const applyService = new ApplyConnectorCapabilityUseCase(registry, adapters, acceptedStore);
    const context = createExecutionContext({ entrypoint: "system" });
    const parameters = {
      targetPool: {
        poolId: "pool_failover",
        targets: [
          {
            targetId: "target_current",
            providerKey: "provider-a",
            region: "ewr",
            status: "ready",
            capabilities: ["kubernetes", "helm"],
            availableCapacity: 4,
            supportLevel: "standard",
          },
          {
            targetId: "target_next",
            providerKey: "provider-b",
            region: "sin",
            status: "ready",
            capabilities: ["kubernetes", "helm"],
            availableCapacity: 3,
            supportLevel: "premium",
          },
        ],
      },
      placementIntent: {
        workloadRef: "resource:res_api",
        requiredCapabilities: ["kubernetes"],
        preferredRegions: ["ewr", "sin"],
        excludedTargetIds: [],
        currentTargetId: "target_current",
        currentPlacementEpoch: 4,
        maxFailoverAttempts: 2,
      },
      mode: "failover",
      attempt: 1,
    };

    const plan = (
      await planService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.failover",
        ownerRef,
        parameters,
      })
    )._unsafeUnwrap();
    expect(plan).toMatchObject({
      riskLevel: "high",
      requiresExplicitAcceptance: true,
      providerPlan: {
        kind: "managed-cluster-placement",
        managedClusterPlacement: {
          selectedTargetId: "target_next",
          previousTargetId: "target_current",
          placementEpoch: 5,
          mode: "failover",
          attempt: 1,
        },
      },
    });

    const accepted = await acceptedPlan({ store: acceptedStore, plan });
    const applied = (
      await applyService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.failover",
        ownerRef,
        acceptedPlanId: accepted.acceptedPlanId,
        parameters,
      })
    )._unsafeUnwrap();
    expect(applied).toMatchObject({
      status: "verified",
      providerResult: {
        kind: "managed-cluster-receipt",
        managedClusterReceipt: {
          action: "failover",
          targetId: "target_next",
          status: "ready",
          placement: {
            previousTargetId: "target_current",
            placementEpoch: 5,
            fencingToken: expect.stringMatching(/^fence_/),
          },
          cleanup: { residualOwnedResources: 0, orphanResourceRefs: [] },
        },
      },
    });

    const recoveryPlan = (
      await planService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.recover",
        ownerRef,
        parameters: { ...parameters, mode: "recovery", attempt: 1 },
      })
    )._unsafeUnwrap();
    const acceptedRecovery = await acceptedPlan({ store: acceptedStore, plan: recoveryPlan });
    const recovered = (
      await applyService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.recover",
        ownerRef,
        acceptedPlanId: acceptedRecovery.acceptedPlanId,
        parameters: { ...parameters, mode: "recovery", attempt: 1 },
      })
    )._unsafeUnwrap();
    expect(recovered).toMatchObject({
      status: "verified",
      providerResult: {
        managedClusterReceipt: {
          action: "recover",
          status: "ready",
          placement: { mode: "recovery", attempt: 1, placementEpoch: 5 },
          cleanup: { residualOwnedResources: 0, orphanResourceRefs: [] },
        },
      },
    });

    const exhausted = await planService.execute(context, {
      connectorKey: "managed-kubernetes",
      capabilityKey: "infrastructure.cluster.failover",
      ownerRef,
      parameters: { ...parameters, attempt: 3 },
    });
    expect(exhausted.isErr()).toBe(true);
    expect(exhausted._unsafeUnwrapErr().code).toBe("conflict");
  });
});
