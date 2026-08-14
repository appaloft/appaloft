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
      "infrastructure.cluster.import",
      "infrastructure.cluster.inspect",
      "infrastructure.cluster.readiness",
      "infrastructure.cluster.drain",
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
  test("[RESIL-CELL-010][RESIL-CELLS-011] runs an exact two-cell lifecycle and retains imported infrastructure", async () => {
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

    const provisionParameters = {
      clusterName: "regional-a",
      targetId: "target_regional_a",
      targetPoolId: "pool_production",
      region: "nyc3",
      clusterClass: "standard-3",
      failureDomains: [
        { kind: "provider", key: "provider-a" },
        { kind: "region", key: "provider-a:nyc3" },
      ],
      availableCapacity: 3,
      activePlacementCount: 0,
      estimatedMonthlyCostUsd: 72,
      supportLevel: "standard",
      requiredCapabilities: ["kubernetes"],
    };
    const provisionPlan = (
      await planService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.provision",
        ownerRef,
        parameters: provisionParameters,
      })
    )._unsafeUnwrap();
    const acceptedProvision = await acceptedPlan({ store: acceptedStore, plan: provisionPlan });
    const provisioned = (
      await applyService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.provision",
        ownerRef,
        acceptedPlanId: acceptedProvision.acceptedPlanId,
        parameters: provisionParameters,
      })
    )._unsafeUnwrap();
    const provisionedRef = provisioned.providerResult?.managedClusterReceipt?.clusterRef;

    const importParameters = {
      clusterRef: "cluster:customer-regional-b",
      clusterName: "regional-b",
      targetId: "target_regional_b",
      targetPoolId: "pool_production",
      region: "sfo3",
      failureDomains: [
        { kind: "provider", key: "provider-a" },
        { kind: "region", key: "provider-a:sfo3" },
      ],
      availableCapacity: 2,
      activePlacementCount: 0,
      estimatedMonthlyCostUsd: 48,
      supportLevel: "community",
      requiredCapabilities: ["kubernetes"],
    };
    const importPlan = (
      await planService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.import",
        ownerRef,
        parameters: importParameters,
      })
    )._unsafeUnwrap();
    const acceptedImport = await acceptedPlan({ store: acceptedStore, plan: importPlan });
    const imported = (
      await applyService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.import",
        ownerRef,
        acceptedPlanId: acceptedImport.acceptedPlanId,
        parameters: importParameters,
      })
    )._unsafeUnwrap();

    expect(provisioned.providerResult?.managedClusterReceipt).toMatchObject({
      capacityCell: {
        origin: "provisioned",
        lifecycleStatus: "accepting",
        providerResourceDisposition: "delete",
        targetId: "target_regional_a",
        availableCapacity: 3,
      },
    });
    expect(imported.providerResult?.managedClusterReceipt).toMatchObject({
      clusterRef: "cluster:customer-regional-b",
      capacityCell: {
        origin: "imported",
        lifecycleStatus: "accepting",
        providerResourceDisposition: "retain",
        targetId: "target_regional_b",
        availableCapacity: 2,
      },
    });
    expect(JSON.stringify(imported)).not.toContain("credential");
    expect(JSON.stringify(imported)).not.toContain("providerBinding");

    const prematureDelete = await planService.execute(context, {
      connectorKey: "managed-kubernetes",
      capabilityKey: "infrastructure.cluster.delete",
      ownerRef,
      parameters: { clusterRef: "cluster:customer-regional-b" },
    });
    expect(prematureDelete.isErr()).toBe(true);
    expect(prematureDelete._unsafeUnwrapErr().code).toBe("conflict");

    const drainPlan = (
      await planService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.drain",
        ownerRef,
        parameters: { clusterRef: "cluster:customer-regional-b" },
      })
    )._unsafeUnwrap();
    const acceptedDrain = await acceptedPlan({ store: acceptedStore, plan: drainPlan });
    const driftedDrain = await applyService.execute(context, {
      connectorKey: "managed-kubernetes",
      capabilityKey: "infrastructure.cluster.drain",
      ownerRef,
      acceptedPlanId: acceptedDrain.acceptedPlanId,
      parameters: { clusterRef: provisionedRef },
    });
    expect(driftedDrain.isErr()).toBe(true);
    expect(driftedDrain._unsafeUnwrapErr().code).toBe("conflict");

    const drained = (
      await applyService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.drain",
        ownerRef,
        acceptedPlanId: acceptedDrain.acceptedPlanId,
        parameters: { clusterRef: "cluster:customer-regional-b" },
      })
    )._unsafeUnwrap();
    expect(drained.providerResult?.managedClusterReceipt).toMatchObject({
      action: "drain",
      capacityCell: {
        lifecycleStatus: "drained",
        availableCapacity: 0,
        activePlacementCount: 0,
      },
    });

    const deletePlan = (
      await planService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.delete",
        ownerRef,
        parameters: { clusterRef: "cluster:customer-regional-b" },
      })
    )._unsafeUnwrap();
    const acceptedDelete = await acceptedPlan({ store: acceptedStore, plan: deletePlan });
    const deleted = (
      await applyService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.delete",
        ownerRef,
        acceptedPlanId: acceptedDelete.acceptedPlanId,
        parameters: { clusterRef: "cluster:customer-regional-b" },
      })
    )._unsafeUnwrap();
    expect(deleted.providerResult?.managedClusterReceipt).toMatchObject({
      action: "delete",
      capacityCell: {
        origin: "imported",
        lifecycleStatus: "deleted",
        providerResourceDisposition: "retain",
      },
      cleanup: { residualOwnedResources: 0, orphanResourceRefs: [] },
    });

    const survivor = (
      await planService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.inspect",
        ownerRef,
        parameters: { clusterRef: provisionedRef },
      })
    )._unsafeUnwrap();
    expect(survivor.providerPlan?.managedClusterReceipt).toMatchObject({
      capacityCell: {
        targetId: "target_regional_a",
        lifecycleStatus: "accepting",
        availableCapacity: 3,
      },
    });
  });

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
      targetId: "target_appaloft_prod",
      region: "ewr",
      failureDomains: [
        { kind: "provider", key: "provider-a" },
        { kind: "region", key: "provider-a:ewr" },
      ],
      clusterClass: "standard-3",
      targetPoolId: "pool_prod",
      availableCapacity: 3,
      activePlacementCount: 0,
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
          targetId: "target_appaloft_prod",
          region: "ewr",
          failureDomains: [
            { kind: "provider", key: "provider-a" },
            { kind: "region", key: "provider-a:ewr" },
          ],
          clusterClass: "standard-3",
          targetPoolId: "pool_prod",
          availableCapacity: 3,
          activePlacementCount: 0,
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

    const drainPlan = (
      await planService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.drain",
        ownerRef,
        parameters: { clusterRef },
      })
    )._unsafeUnwrap();
    const acceptedDrain = await acceptedPlan({ store: acceptedStore, plan: drainPlan });
    const drained = (
      await applyService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.drain",
        ownerRef,
        acceptedPlanId: acceptedDrain.acceptedPlanId,
        parameters: { clusterRef },
      })
    )._unsafeUnwrap();
    expect(drained.providerResult?.managedClusterReceipt?.capacityCell).toMatchObject({
      lifecycleStatus: "drained",
      availableCapacity: 0,
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
            failureDomains: [
              { kind: "provider", key: "provider-a" },
              { kind: "region", key: "provider-a:ewr" },
            ],
            status: "ready",
            capabilities: ["kubernetes", "helm"],
            availableCapacity: 4,
            supportLevel: "standard",
          },
          {
            targetId: "target_next",
            providerKey: "provider-b",
            region: "sin",
            failureDomains: [
              { kind: "provider", key: "provider-b" },
              { kind: "region", key: "provider-b:sin" },
            ],
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
        requiredFailureDomainKinds: ["provider", "region"],
      },
      mode: "failover",
      attempt: 1,
      stateEligibility: {
        workloadRef: "resource:res_api",
        currentTargetId: "target_current",
        replacementTargetId: "target_next",
        mode: "stateless",
        status: "eligible",
        evaluatedAt: "2026-08-14T12:00:00.000Z",
        reasonCodes: ["state_stateless"],
      },
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
          selectedFailureDomains: [
            { kind: "provider", key: "provider-b" },
            { kind: "region", key: "provider-b:sin" },
          ],
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

  test("[RESIL-PLACE-002] rejects a shared failure domain before a placement plan exists", async () => {
    const registry = new InMemoryConnectorRegistry([managedConnectorDefinition()]);
    const adapter = new FakeInfrastructureConnectorProviderAdapter({
      connectorKey: "managed-kubernetes",
      providerKey: "provider-a",
      providerTitle: "Managed Kubernetes",
    });
    const planService = new PlanConnectorCapabilityQueryService(
      registry,
      new InMemoryConnectorProviderAdapterRegistry([adapter]),
    );

    const result = await planService.execute(createExecutionContext({ entrypoint: "system" }), {
      connectorKey: "managed-kubernetes",
      capabilityKey: "infrastructure.cluster.failover",
      ownerRef,
      parameters: {
        targetPool: {
          poolId: "pool_shared_provider",
          targets: [
            {
              targetId: "target_current",
              providerKey: "provider-a",
              region: "ewr",
              failureDomains: [{ kind: "provider", key: "provider-a" }],
              status: "ready",
              capabilities: ["kubernetes"],
              availableCapacity: 2,
              supportLevel: "standard",
            },
            {
              targetId: "target_candidate",
              providerKey: "provider-a",
              region: "sin",
              failureDomains: [{ kind: "provider", key: "provider-a" }],
              status: "ready",
              capabilities: ["kubernetes"],
              availableCapacity: 2,
              supportLevel: "standard",
            },
          ],
        },
        placementIntent: {
          workloadRef: "resource:res_api",
          requiredCapabilities: ["kubernetes"],
          preferredRegions: ["sin"],
          excludedTargetIds: [],
          currentTargetId: "target_current",
          currentPlacementEpoch: 2,
          maxFailoverAttempts: 2,
          requiredFailureDomainKinds: ["provider"],
        },
        mode: "failover",
        attempt: 1,
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "conflict",
      details: {
        ineligibilityReasons: expect.arrayContaining([
          "target_candidate:failure-domain:shared:provider",
        ]),
      },
    });
  });

  test("[RESIL-READY-004] plans typed readiness without acceptance or an apply path", async () => {
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
        poolId: "pool_readiness",
        targets: [
          {
            targetId: "target_current",
            providerKey: "provider-a",
            region: "ewr",
            failureDomains: [{ kind: "provider", key: "provider-a" }],
            status: "ready",
            capabilities: ["kubernetes"],
            availableCapacity: 2,
            supportLevel: "standard",
          },
          {
            targetId: "target_next",
            providerKey: "provider-b",
            region: "sin",
            failureDomains: [{ kind: "provider", key: "provider-b" }],
            status: "ready",
            capabilities: ["kubernetes"],
            availableCapacity: 3,
            estimatedMonthlyCostUsd: 120,
            supportLevel: "premium",
          },
        ],
      },
      placementIntent: {
        workloadRef: "resource:res_api",
        requiredCapabilities: ["kubernetes"],
        preferredRegions: ["sin"],
        excludedTargetIds: [],
        currentTargetId: "target_current",
        currentPlacementEpoch: 4,
        maxFailoverAttempts: 2,
        requiredFailureDomainKinds: ["provider"],
      },
    };

    const plan = (
      await planService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.readiness",
        ownerRef,
        parameters,
      })
    )._unsafeUnwrap();

    expect(plan).toMatchObject({
      riskLevel: "low",
      requiresExplicitAcceptance: false,
      cleanup: { supported: false },
      effects: [{ kind: "infrastructure.cluster.readiness", title: expect.any(String) }],
      providerPlan: {
        kind: "managed-cluster-replacement-readiness",
        managedClusterReplacementReadiness: {
          status: "ready",
          currentTargetId: "target_current",
          currentPlacementEpoch: 4,
          selectedTargetId: "target_next",
          eligibleReplacementTargetIds: ["target_next"],
          totalEligibleReplacementCapacity: 3,
        },
      },
    });
    expect(JSON.stringify(plan)).not.toContain("fencingToken");
    expect(JSON.stringify(plan)).not.toContain("credential");
    expect(adapter.canApply("infrastructure.cluster.readiness")).toBe(false);

    const apply = await applyService.execute(context, {
      connectorKey: "managed-kubernetes",
      capabilityKey: "infrastructure.cluster.readiness",
      ownerRef,
      parameters,
    });
    expect(apply.isErr()).toBe(true);

    const blocked = (
      await planService.execute(context, {
        connectorKey: "managed-kubernetes",
        capabilityKey: "infrastructure.cluster.readiness",
        ownerRef,
        parameters: {
          ...parameters,
          targetPool: {
            ...parameters.targetPool,
            targets: parameters.targetPool.targets.map((target) =>
              target.targetId === "target_next"
                ? {
                    ...target,
                    providerKey: "provider-a",
                    failureDomains: [{ kind: "provider", key: "provider-a" }],
                  }
                : target,
            ),
          },
        },
      })
    )._unsafeUnwrap();
    expect(blocked.providerPlan?.managedClusterReplacementReadiness).toMatchObject({
      status: "blocked",
      reasonCodes: expect.arrayContaining(["failure-domain:shared:provider"]),
    });
  });
});
