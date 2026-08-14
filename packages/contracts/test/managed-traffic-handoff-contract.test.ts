import { describe, expect, test } from "bun:test";

import { connectorCapabilityApplyResultSchema, connectorCapabilityPlanPreviewSchema } from "../src";

const currentRoute = {
  routeRef: "route:api.example.com",
  workloadRef: "resource:api",
  activeEndpointRef: "endpoint:ewr",
  activeTargetId: "target_ewr",
  placementEpoch: 4,
  fencingToken: "fence_epoch_4",
};

const health = {
  endpointRef: "endpoint:sin",
  status: "healthy" as const,
  observedAt: "2026-08-14T12:00:00.000Z",
  validUntil: "2026-08-14T12:05:00.000Z",
  proofRef: "health-proof:sin:42",
};

const handoffPlan = {
  action: "handoff" as const,
  currentRoute,
  currentEndpoint: {
    endpointRef: "endpoint:ewr",
    workloadRef: "resource:api",
    targetId: "target_ewr",
  },
  replacementEndpoint: {
    endpointRef: "endpoint:sin",
    workloadRef: "resource:api",
    targetId: "target_sin",
  },
  replacementHealth: health,
  nextPlacementEpoch: 5,
  nextFencingToken: "fence_epoch_5",
  rollbackEndpointRef: "endpoint:ewr",
  plannedAt: "2026-08-14T12:01:00.000Z",
};

describe("managed traffic handoff contracts", () => {
  test("[RESIL-FENCE-005][RESIL-ROUTE-006] preserves only safe accepted-plan evidence", () => {
    const preview = connectorCapabilityPlanPreviewSchema.parse({
      planId: "trafficplan_12345678",
      connectorKey: "managed-kubernetes",
      capabilityKey: "infrastructure.cluster.handoff-traffic",
      riskLevel: "high",
      requiresExplicitAcceptance: true,
      summary: "Move traffic to healthy replacement",
      effects: [{ kind: "infrastructure.cluster.handoff-traffic", title: "Move traffic" }],
      cleanup: { supported: true },
      providerPlan: {
        kind: "managed-traffic-handoff",
        managedTrafficHandoffPlan: {
          ...handoffPlan,
          credential: "must-not-survive",
          providerBindingRef: "must-not-survive",
        },
      },
    });

    expect(preview.providerPlan?.managedTrafficHandoffPlan).toEqual(handoffPlan);
    expect(JSON.stringify(preview)).not.toContain("credential");
    expect(JSON.stringify(preview)).not.toContain("providerBindingRef");
  });

  test("[RESIL-ROUTE-006][RESIL-CLEAN-008] preserves an explicit verified outcome", () => {
    const finalRoute = {
      ...currentRoute,
      activeEndpointRef: "endpoint:sin",
      activeTargetId: "target_sin",
      placementEpoch: 5,
      fencingToken: "fence_epoch_5",
    };
    const result = connectorCapabilityApplyResultSchema.parse({
      operationId: "trafficop_12345678",
      connectorKey: "managed-kubernetes",
      capabilityKey: "infrastructure.cluster.handoff-traffic",
      status: "verified",
      summary: "Traffic moved and verified",
      effects: [{ kind: "traffic.authority.verified", title: "Verified", managed: true }],
      providerResult: {
        kind: "managed-traffic-handoff-receipt",
        managedTrafficHandoffReceipt: {
          operationId: "trafficop_12345678",
          action: "handoff",
          outcome: "moved",
          previousRoute: currentRoute,
          finalRoute,
          healthEvidence: health,
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
          rawProviderResponse: { secret: "must-not-survive" },
        },
      },
    });

    expect(result.providerResult?.managedTrafficHandoffReceipt).toMatchObject({
      outcome: "moved",
      finalRoute: { activeTargetId: "target_sin", placementEpoch: 5 },
      rollbackAttempts: 0,
      cleanup: { residualOwnedResources: 0 },
    });
    expect(JSON.stringify(result)).not.toContain("rawProviderResponse");
    expect(JSON.stringify(result)).not.toContain("must-not-survive");
  });
});
