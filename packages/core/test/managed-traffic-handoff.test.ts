import { describe, expect, test } from "bun:test";

import {
  ManagedTrafficHandoffPlan,
  ManagedTrafficHandoffReceipt,
  ManagedTrafficHealthEvidence,
} from "../src";

const currentRoute = {
  routeRef: "route:api.example.com",
  workloadRef: "resource:api",
  activeEndpointRef: "endpoint:ewr",
  activeTargetId: "target_ewr",
  placementEpoch: 4,
  fencingToken: "fence_epoch_4",
};

const currentEndpoint = {
  endpointRef: "endpoint:ewr",
  workloadRef: "resource:api",
  targetId: "target_ewr",
};

const replacementEndpoint = {
  endpointRef: "endpoint:sin",
  workloadRef: "resource:api",
  targetId: "target_sin",
};

const replacementHealth = {
  endpointRef: "endpoint:sin",
  status: "healthy" as const,
  observedAt: "2026-08-14T12:00:00.000Z",
  validUntil: "2026-08-14T12:05:00.000Z",
  proofRef: "health-proof:sin:42",
};

const handoffPlan = {
  action: "handoff" as const,
  currentRoute,
  currentEndpoint,
  replacementEndpoint,
  replacementHealth,
  nextPlacementEpoch: 5,
  nextFencingToken: "fence_epoch_5",
  rollbackEndpointRef: "endpoint:ewr",
  plannedAt: "2026-08-14T12:01:00.000Z",
};

describe("ManagedTrafficHandoffPlan", () => {
  test("[RESIL-FENCE-005][RESIL-ROUTE-006] binds route authority, fresh health, and the next fencing epoch", () => {
    const plan = ManagedTrafficHandoffPlan.create(handoffPlan)._unsafeUnwrap();

    expect(plan.toJSON()).toEqual(handoffPlan);
    expect(plan.healthIsFreshAt("2026-08-14T12:04:59.000Z")).toBe(true);
    expect(plan.healthIsFreshAt("2026-08-14T12:05:00.001Z")).toBe(false);

    expect(
      ManagedTrafficHandoffPlan.create({ ...handoffPlan, nextPlacementEpoch: 6 }).isErr(),
    ).toBe(true);
    expect(
      ManagedTrafficHandoffPlan.create({
        ...handoffPlan,
        replacementHealth: { ...replacementHealth, endpointRef: "endpoint:other" },
      }).isErr(),
    ).toBe(true);
    expect(
      ManagedTrafficHandoffPlan.create({
        ...handoffPlan,
        nextFencingToken: currentRoute.fencingToken,
      }).isErr(),
    ).toBe(true);
  });

  test("[RESIL-ROUTE-006] rejects unhealthy or already-expired replacement evidence", () => {
    expect(
      ManagedTrafficHandoffPlan.create({
        ...handoffPlan,
        replacementHealth: { ...replacementHealth, status: "unhealthy" as const },
      }).isErr(),
    ).toBe(true);
    expect(
      ManagedTrafficHandoffPlan.create({
        ...handoffPlan,
        plannedAt: "2026-08-14T12:06:00.000Z",
      }).isErr(),
    ).toBe(true);
  });
});

describe("ManagedTrafficHealthEvidence", () => {
  test("[RESIL-ROUTE-006] treats validUntil as an exclusive freshness boundary", () => {
    const evidence = ManagedTrafficHealthEvidence.create(replacementHealth)._unsafeUnwrap();
    expect(evidence.isFreshAt("2026-08-14T12:04:59.999Z")).toBe(true);
    expect(evidence.isFreshAt("2026-08-14T12:05:00.000Z")).toBe(false);
  });
});

describe("ManagedTrafficHandoffReceipt", () => {
  test("[RESIL-FENCE-005][RESIL-CLEAN-008] proves moved and rolled-back outcomes without ambiguous success", () => {
    const movedRoute = {
      ...currentRoute,
      activeEndpointRef: replacementEndpoint.endpointRef,
      activeTargetId: replacementEndpoint.targetId,
      placementEpoch: 5,
      fencingToken: "fence_epoch_5",
    };
    const moved = ManagedTrafficHandoffReceipt.create({
      operationId: "trafficop_move",
      action: "handoff",
      outcome: "moved",
      previousRoute: currentRoute,
      finalRoute: movedRoute,
      healthEvidence: replacementHealth,
      executionSteps: [
        "route-read",
        "health-read",
        "previous-fenced",
        "route-moved",
        "authority-verified",
        "cleanup-complete",
      ],
      rollbackAttempts: 0,
      cleanup: { residualOwnedResources: 0, transientResourceRefs: [] },
    })._unsafeUnwrap();
    expect(moved.toJSON().outcome).toBe("moved");

    const rolledBack = ManagedTrafficHandoffReceipt.create({
      ...moved.toJSON(),
      operationId: "trafficop_rollback",
      outcome: "rolled-back",
      finalRoute: currentRoute,
      executionSteps: [
        "route-read",
        "health-read",
        "previous-fenced",
        "route-moved",
        "authority-verification-failed",
        "rollback-moved",
        "rollback-verified",
        "cleanup-complete",
      ],
      rollbackAttempts: 1,
    })._unsafeUnwrap();
    expect(rolledBack.toJSON().finalRoute).toEqual(currentRoute);

    expect(
      ManagedTrafficHandoffReceipt.create({
        ...rolledBack.toJSON(),
        outcome: "rolled-back",
        rollbackAttempts: 0,
      }).isErr(),
    ).toBe(true);
    expect(
      ManagedTrafficHandoffReceipt.create({
        ...moved.toJSON(),
        outcome: "moved",
        finalRoute: currentRoute,
      }).isErr(),
    ).toBe(true);
  });
});
