import { describe, expect, test } from "bun:test";
import { ManagedClusterPlacementIntent, ManagedClusterTargetPool } from "@appaloft/core";

describe("Managed cluster topology", () => {
  test("[K8S-MULTI-015] selects a deterministic eligible target with safe decision evidence", () => {
    const pool = ManagedClusterTargetPool.create({
      poolId: "pool_primary",
      targets: [
        {
          targetId: "target_z",
          providerKey: "provider-b",
          region: "sin",
          status: "ready",
          capabilities: ["kubernetes", "stateful", "helm"],
          availableCapacity: 8,
          estimatedMonthlyCostUsd: 120,
          supportLevel: "premium",
        },
        {
          targetId: "target_b",
          providerKey: "provider-a",
          region: "ewr",
          status: "ready",
          capabilities: ["helm", "kubernetes", "stateful"],
          availableCapacity: 4,
          estimatedMonthlyCostUsd: 90,
          supportLevel: "standard",
        },
        {
          targetId: "target_a",
          providerKey: "provider-a",
          region: "ewr",
          status: "ready",
          capabilities: ["kubernetes", "stateful", "helm"],
          availableCapacity: 4,
          estimatedMonthlyCostUsd: 90,
          supportLevel: "standard",
        },
      ],
    })._unsafeUnwrap();
    const intent = ManagedClusterPlacementIntent.create({
      workloadRef: "resource:res_api",
      requiredCapabilities: ["kubernetes", "stateful"],
      preferredRegions: ["ewr", "sin"],
      excludedTargetIds: [],
      currentPlacementEpoch: 0,
      maxFailoverAttempts: 2,
    })._unsafeUnwrap();

    const first = pool.decidePlacement(intent, { mode: "initial", attempt: 0 })._unsafeUnwrap();
    const second = pool.decidePlacement(intent, { mode: "initial", attempt: 0 })._unsafeUnwrap();

    expect(first.toJSON()).toEqual(second.toJSON());
    expect(first.toJSON()).toMatchObject({
      poolId: "pool_primary",
      workloadRef: "resource:res_api",
      mode: "initial",
      attempt: 0,
      selectedTargetId: "target_a",
      selectedProviderKey: "provider-a",
      selectedRegion: "ewr",
      placementEpoch: 1,
      rankedEligibleTargetIds: ["target_a", "target_b", "target_z"],
    });
    expect(first.toJSON().fencingToken).toStartWith("fence_");
    expect(first.toJSON().consideredTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetId: "target_a", eligible: true }),
        expect.objectContaining({ targetId: "target_z", eligible: true }),
      ]),
    );
  });

  test("[K8S-MULTI-015] failover fences the previous target and never silently falls back", () => {
    const pool = ManagedClusterTargetPool.create({
      poolId: "pool_failover",
      targets: [
        {
          targetId: "target_current",
          providerKey: "provider-a",
          region: "ewr",
          status: "ready",
          capabilities: ["kubernetes", "helm"],
          availableCapacity: 5,
          estimatedMonthlyCostUsd: 50,
          supportLevel: "standard",
        },
        {
          targetId: "target_replacement",
          providerKey: "provider-b",
          region: "sin",
          status: "ready",
          capabilities: ["kubernetes", "helm"],
          availableCapacity: 3,
          estimatedMonthlyCostUsd: 75,
          supportLevel: "premium",
        },
      ],
    })._unsafeUnwrap();
    const intent = ManagedClusterPlacementIntent.create({
      workloadRef: "resource:res_worker",
      requiredCapabilities: ["kubernetes"],
      preferredRegions: ["ewr", "sin"],
      excludedTargetIds: [],
      currentTargetId: "target_current",
      currentPlacementEpoch: 7,
      maxFailoverAttempts: 1,
    })._unsafeUnwrap();

    const decision = pool
      .decidePlacement(intent, { mode: "failover", attempt: 1 })
      ._unsafeUnwrap()
      .toJSON();
    expect(decision).toMatchObject({
      selectedTargetId: "target_replacement",
      previousTargetId: "target_current",
      placementEpoch: 8,
      mode: "failover",
      attempt: 1,
    });
    expect(decision.rankedEligibleTargetIds).toEqual(["target_replacement"]);

    const exhausted = pool.decidePlacement(intent, { mode: "failover", attempt: 2 });
    expect(exhausted.isErr()).toBe(true);
    expect(exhausted._unsafeUnwrapErr().code).toBe("conflict");

    const unavailablePool = ManagedClusterTargetPool.create({
      poolId: "pool_unavailable",
      targets: [
        {
          targetId: "target_only",
          providerKey: "provider-a",
          region: "ewr",
          status: "unavailable",
          capabilities: ["kubernetes"],
          availableCapacity: 4,
          supportLevel: "standard",
        },
      ],
    })._unsafeUnwrap();
    const unavailable = unavailablePool.decidePlacement(
      ManagedClusterPlacementIntent.create({
        workloadRef: "resource:res_api",
        requiredCapabilities: ["kubernetes"],
        preferredRegions: ["ewr"],
        excludedTargetIds: [],
        currentPlacementEpoch: 0,
        maxFailoverAttempts: 1,
      })._unsafeUnwrap(),
      { mode: "initial", attempt: 0 },
    );
    expect(unavailable.isErr()).toBe(true);
    expect(unavailable._unsafeUnwrapErr()).toMatchObject({
      code: "conflict",
      details: expect.objectContaining({ poolId: "pool_unavailable" }),
    });
  });

  test("[K8S-MULTI-015] rejects duplicate targets and unsafe policy bounds", () => {
    const duplicate = ManagedClusterTargetPool.create({
      poolId: "pool_duplicate",
      targets: [
        {
          targetId: "target_same",
          providerKey: "provider-a",
          region: "ewr",
          status: "ready",
          capabilities: ["kubernetes"],
          availableCapacity: 1,
          supportLevel: "standard",
        },
        {
          targetId: "target_same",
          providerKey: "provider-b",
          region: "sin",
          status: "ready",
          capabilities: ["kubernetes"],
          availableCapacity: 1,
          supportLevel: "standard",
        },
      ],
    });
    expect(duplicate.isErr()).toBe(true);

    const unbounded = ManagedClusterPlacementIntent.create({
      workloadRef: "resource:res_api",
      requiredCapabilities: ["kubernetes"],
      preferredRegions: [],
      excludedTargetIds: [],
      currentPlacementEpoch: 0,
      maxFailoverAttempts: 99,
    });
    expect(unbounded.isErr()).toBe(true);
  });

  test("[RESIL-PLACE-002] rejects failover targets that share a required failure domain", () => {
    const pool = ManagedClusterTargetPool.create({
      poolId: "pool_regional",
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
          capabilities: ["kubernetes"],
          availableCapacity: 2,
          supportLevel: "standard",
        },
        {
          targetId: "target_replacement",
          providerKey: "provider-a",
          region: "sin",
          failureDomains: [
            { kind: "provider", key: "provider-a" },
            { kind: "region", key: "provider-a:sin" },
          ],
          status: "ready",
          capabilities: ["kubernetes"],
          availableCapacity: 2,
          supportLevel: "standard",
        },
      ],
    })._unsafeUnwrap();
    const intent = ManagedClusterPlacementIntent.create({
      workloadRef: "resource:res_regional",
      requiredCapabilities: ["kubernetes"],
      preferredRegions: ["sin", "ewr"],
      excludedTargetIds: [],
      currentTargetId: "target_current",
      currentPlacementEpoch: 2,
      maxFailoverAttempts: 1,
      requiredFailureDomainKinds: ["provider"],
    })._unsafeUnwrap();

    const result = pool.decidePlacement(intent, { mode: "failover", attempt: 1 });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "conflict",
      details: expect.objectContaining({
        ineligibilityReasons: expect.arrayContaining([
          "target_replacement:failure-domain:shared:provider",
        ]),
      }),
    });
  });

  test("[RESIL-FD-001] rejects duplicate failure-domain kinds on one target", () => {
    const result = ManagedClusterTargetPool.create({
      poolId: "pool_duplicate_domain",
      targets: [
        {
          targetId: "target_duplicate_domain",
          providerKey: "provider-a",
          region: "ewr",
          failureDomains: [
            { kind: "region", key: "provider-a:ewr" },
            { kind: "region", key: "provider-a:ewr-duplicate" },
          ],
          status: "ready",
          capabilities: ["kubernetes"],
          availableCapacity: 1,
          supportLevel: "standard",
        },
      ],
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toBe(
      "Managed cluster failure domain kinds must be unique",
    );
  });

  test("[RESIL-FD-001] rejects unsupported failure-domain kinds", () => {
    const result = ManagedClusterTargetPool.create({
      poolId: "pool_unsupported_domain",
      targets: [
        {
          targetId: "target_unsupported_domain",
          providerKey: "provider-a",
          region: "ewr",
          failureDomains: [{ kind: "rack" as never, key: "rack-1" }],
          status: "ready",
          capabilities: ["kubernetes"],
          availableCapacity: 1,
          supportLevel: "standard",
        },
      ],
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toBe(
      "Unsupported managed cluster failure domain rack",
    );
  });

  test("[RESIL-FD-001] rejects empty failure-domain keys", () => {
    const result = ManagedClusterTargetPool.create({
      poolId: "pool_empty_domain",
      targets: [
        {
          targetId: "target_empty_domain",
          providerKey: "provider-a",
          region: "ewr",
          failureDomains: [{ kind: "region", key: "   " }],
          status: "ready",
          capabilities: ["kubernetes"],
          availableCapacity: 1,
          supportLevel: "standard",
        },
      ],
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toBe(
      "Managed cluster failure domain key is required",
    );
  });

  test("[RESIL-FD-001] rejects duplicate required failure-domain kinds", () => {
    const result = ManagedClusterPlacementIntent.create({
      workloadRef: "resource:res_duplicate_requirement",
      requiredCapabilities: ["kubernetes"],
      preferredRegions: ["ewr"],
      excludedTargetIds: [],
      currentTargetId: "target_current",
      currentPlacementEpoch: 1,
      maxFailoverAttempts: 1,
      requiredFailureDomainKinds: ["region", "region"],
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toBe(
      "Managed cluster required failure domains must not contain duplicates",
    );
  });

  test("[RESIL-FD-001] rejects unsupported required failure-domain kinds", () => {
    const result = ManagedClusterPlacementIntent.create({
      workloadRef: "resource:res_unsupported_requirement",
      requiredCapabilities: ["kubernetes"],
      preferredRegions: ["ewr"],
      excludedTargetIds: [],
      currentTargetId: "target_current",
      currentPlacementEpoch: 1,
      maxFailoverAttempts: 1,
      requiredFailureDomainKinds: ["rack" as never],
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toBe(
      "Unsupported managed cluster failure domain rack",
    );
  });

  test("[RESIL-DECIDE-003] returns deterministic selected-domain evidence", () => {
    const pool = ManagedClusterTargetPool.create({
      poolId: "pool_independent",
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
          capabilities: ["kubernetes"],
          availableCapacity: 2,
          supportLevel: "standard",
        },
        {
          targetId: "target_independent",
          providerKey: "provider-b",
          region: "sin",
          failureDomains: [
            { kind: "provider", key: "provider-b" },
            { kind: "region", key: "provider-b:sin" },
          ],
          status: "ready",
          capabilities: ["kubernetes"],
          availableCapacity: 2,
          supportLevel: "standard",
        },
      ],
    })._unsafeUnwrap();
    const intent = ManagedClusterPlacementIntent.create({
      workloadRef: "resource:res_independent",
      requiredCapabilities: ["kubernetes"],
      preferredRegions: ["sin", "ewr"],
      excludedTargetIds: [],
      currentTargetId: "target_current",
      currentPlacementEpoch: 4,
      maxFailoverAttempts: 1,
      requiredFailureDomainKinds: ["provider", "region"],
    })._unsafeUnwrap();

    const first = pool
      .decidePlacement(intent, { mode: "failover", attempt: 1 })
      ._unsafeUnwrap()
      .toJSON();
    const second = pool
      .decidePlacement(intent, { mode: "failover", attempt: 1 })
      ._unsafeUnwrap()
      .toJSON();

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      selectedTargetId: "target_independent",
      selectedFailureDomains: [
        { kind: "provider", key: "provider-b" },
        { kind: "region", key: "provider-b:sin" },
      ],
      placementEpoch: 5,
      reasonCodes: expect.arrayContaining([
        "failure-domain:provider:separated",
        "failure-domain:region:separated",
      ]),
    });
  });

  test("[RESIL-READY-004] reports deterministic independent replacement readiness without fencing", () => {
    const pool = ManagedClusterTargetPool.create({
      poolId: "pool_readiness",
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
          capabilities: ["kubernetes", "stateful"],
          availableCapacity: 8,
          estimatedMonthlyCostUsd: 80,
          supportLevel: "standard",
        },
        {
          targetId: "target_z",
          providerKey: "provider-c",
          region: "fra",
          failureDomains: [
            { kind: "provider", key: "provider-c" },
            { kind: "region", key: "provider-c:fra" },
          ],
          status: "ready",
          capabilities: ["kubernetes", "stateful"],
          availableCapacity: 5,
          estimatedMonthlyCostUsd: 120,
          supportLevel: "premium",
        },
        {
          targetId: "target_a",
          providerKey: "provider-b",
          region: "sin",
          failureDomains: [
            { kind: "provider", key: "provider-b" },
            { kind: "region", key: "provider-b:sin" },
          ],
          status: "ready",
          capabilities: ["stateful", "kubernetes"],
          availableCapacity: 3,
          estimatedMonthlyCostUsd: 100,
          supportLevel: "premium",
        },
      ],
    })._unsafeUnwrap();
    const intent = ManagedClusterPlacementIntent.create({
      workloadRef: "resource:res_readiness",
      requiredCapabilities: ["stateful", "kubernetes"],
      preferredRegions: ["sin", "fra"],
      excludedTargetIds: [],
      currentTargetId: "target_current",
      currentPlacementEpoch: 9,
      maxFailoverAttempts: 2,
      requiredFailureDomainKinds: ["provider", "region"],
    })._unsafeUnwrap();

    const first = pool.checkReplacementReadiness(intent)._unsafeUnwrap().toJSON();
    const second = pool.checkReplacementReadiness(intent)._unsafeUnwrap().toJSON();

    expect(first).toEqual(second);
    expect(first).toEqual({
      poolId: "pool_readiness",
      workloadRef: "resource:res_readiness",
      currentTargetId: "target_current",
      currentPlacementEpoch: 9,
      status: "ready",
      requiredCapabilities: ["kubernetes", "stateful"],
      requiredFailureDomainKinds: ["provider", "region"],
      selectedTargetId: "target_a",
      selectedProviderKey: "provider-b",
      selectedRegion: "sin",
      selectedFailureDomains: [
        { kind: "provider", key: "provider-b" },
        { kind: "region", key: "provider-b:sin" },
      ],
      selectedEstimatedMonthlyCostUsd: 100,
      selectedSupportLevel: "premium",
      eligibleReplacementTargetIds: ["target_a", "target_z"],
      totalEligibleReplacementCapacity: 8,
      reasonCodes: [
        "replacement:ready",
        "failure-domain:provider:separated",
        "failure-domain:region:separated",
        "cost:lowest-eligible",
        "tie-break:target-id",
      ],
      consideredTargets: [
        {
          targetId: "target_a",
          eligible: true,
          availableCapacity: 3,
          reasons: [],
        },
        {
          targetId: "target_current",
          eligible: false,
          availableCapacity: 8,
          reasons: ["failover:previous-target"],
        },
        {
          targetId: "target_z",
          eligible: true,
          availableCapacity: 5,
          reasons: [],
        },
      ],
    });
    expect(first).not.toHaveProperty("placementEpoch");
    expect(first).not.toHaveProperty("fencingToken");
  });

  test("[RESIL-READY-004] returns typed blocked evidence and validates an exact current placement", () => {
    const pool = ManagedClusterTargetPool.create({
      poolId: "pool_blocked",
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
          targetId: "target_shared",
          providerKey: "provider-a",
          region: "sin",
          failureDomains: [{ kind: "provider", key: "provider-a" }],
          status: "ready",
          capabilities: ["kubernetes"],
          availableCapacity: 2,
          supportLevel: "standard",
        },
        {
          targetId: "target_empty",
          providerKey: "provider-b",
          region: "fra",
          failureDomains: [{ kind: "provider", key: "provider-b" }],
          status: "ready",
          capabilities: ["kubernetes"],
          availableCapacity: 0,
          supportLevel: "community",
        },
      ],
    })._unsafeUnwrap();
    const intent = ManagedClusterPlacementIntent.create({
      workloadRef: "resource:res_blocked",
      requiredCapabilities: ["kubernetes"],
      preferredRegions: ["sin", "fra"],
      excludedTargetIds: [],
      currentTargetId: "target_current",
      currentPlacementEpoch: 3,
      maxFailoverAttempts: 1,
      requiredFailureDomainKinds: ["provider"],
    })._unsafeUnwrap();

    const blocked = pool.checkReplacementReadiness(intent)._unsafeUnwrap().toJSON();

    expect(blocked).toMatchObject({
      status: "blocked",
      eligibleReplacementTargetIds: [],
      totalEligibleReplacementCapacity: 0,
      reasonCodes: [
        "replacement:no-eligible-target",
        "capacity:unavailable",
        "failure-domain:shared:provider",
      ],
    });
    expect(blocked.consideredTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: "target_shared",
          eligible: false,
          reasons: ["failure-domain:shared:provider"],
        }),
        expect.objectContaining({
          targetId: "target_empty",
          eligible: false,
          reasons: ["capacity:unavailable"],
        }),
      ]),
    );

    const missingCurrent = pool.checkReplacementReadiness(
      ManagedClusterPlacementIntent.create({
        ...intent.toJSON(),
        currentTargetId: "target_missing",
      })._unsafeUnwrap(),
    );
    expect(missingCurrent._unsafeUnwrap().toJSON()).toMatchObject({
      status: "blocked",
      reasonCodes: ["replacement:current-target-missing"],
      eligibleReplacementTargetIds: [],
      totalEligibleReplacementCapacity: 0,
    });

    const { currentTargetId: _currentTargetId, ...withoutCurrentTarget } = intent.toJSON();
    const noCurrent = pool.checkReplacementReadiness(
      ManagedClusterPlacementIntent.create(withoutCurrentTarget)._unsafeUnwrap(),
    );
    expect(noCurrent.isErr()).toBe(true);
    expect(noCurrent._unsafeUnwrapErr().message).toBe(
      "Managed cluster replacement readiness requires a current target",
    );
  });
});
