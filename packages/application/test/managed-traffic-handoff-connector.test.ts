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

const ownerRef = { scope: "project" as const, id: "proj_traffic" };
const currentRoute = {
  routeRef: "route:api.example.com",
  workloadRef: "resource:api",
  activeEndpointRef: "endpoint:ewr",
  activeTargetId: "target_ewr",
  placementEpoch: 4,
  fencingToken: "fence_epoch_4",
};

function connectorDefinition() {
  return {
    key: "managed-kubernetes",
    title: "Managed Kubernetes",
    category: "infrastructure" as const,
    providerKey: "provider-a",
    capabilities: [
      "infrastructure.cluster.handoff-traffic",
      "infrastructure.cluster.failback-traffic",
      "infrastructure.cluster.traffic-status",
    ].map((key) => ({ key, title: key, implemented: true })),
    grantKinds: [],
    availability: { status: "available" as const, diagnostics: [] },
    visibility: "catalog" as const,
  };
}

function handoffParameters() {
  return {
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
    replacementHealth: {
      endpointRef: "endpoint:sin",
      status: "healthy" as const,
      observedAt: "2026-08-14T12:00:00.000Z",
      validUntil: "2026-08-14T12:05:00.000Z",
      proofRef: "health-proof:sin:42",
    },
    nextPlacementEpoch: 5,
    nextFencingToken: "fence_epoch_5",
    rollbackEndpointRef: "endpoint:ewr",
    plannedAt: "2026-08-14T12:01:00.000Z",
  };
}

function harness(options?: {
  now?: () => string;
  trafficFailureMode?: "before-move" | "after-move" | "rollback-unverified";
}) {
  const registry = new InMemoryConnectorRegistry([connectorDefinition()]);
  const adapter = new FakeInfrastructureConnectorProviderAdapter({
    connectorKey: "managed-kubernetes",
    providerKey: "provider-a",
    providerTitle: "Managed Kubernetes",
    trafficRoutes: [currentRoute],
    ...options,
  });
  const adapters = new InMemoryConnectorProviderAdapterRegistry([adapter]);
  const acceptedStore = new InMemoryAcceptedConnectionCapabilityPlanStore();
  return {
    plan: new PlanConnectorCapabilityQueryService(registry, adapters),
    apply: new ApplyConnectorCapabilityUseCase(registry, adapters, acceptedStore),
    accept: new AcceptConnectorCapabilityPlanUseCase(acceptedStore),
    context: createExecutionContext({
      entrypoint: "system",
      actor: { kind: "user", id: "actor_owner" },
    }),
  };
}

async function planAcceptApply(
  target: ReturnType<typeof harness>,
  capabilityKey: string,
  parameters: Record<string, unknown>,
) {
  const plan = (
    await target.plan.execute(target.context, {
      connectorKey: "managed-kubernetes",
      capabilityKey,
      ownerRef,
      parameters,
    })
  )._unsafeUnwrap();
  const accepted = (
    await target.accept.execute(target.context, {
      ...plan,
      ownerRef,
      acceptedBy: "actor_owner",
    })
  )._unsafeUnwrap();
  const result = await target.apply.execute(target.context, {
    connectorKey: "managed-kubernetes",
    capabilityKey,
    ownerRef,
    acceptedPlanId: accepted.acceptedPlanId,
    parameters,
  });
  return { plan, accepted, result };
}

async function trafficStatus(target: ReturnType<typeof harness>) {
  return (
    await target.plan.execute(target.context, {
      connectorKey: "managed-kubernetes",
      capabilityKey: "infrastructure.cluster.traffic-status",
      ownerRef,
      parameters: { routeRef: currentRoute.routeRef },
    })
  )._unsafeUnwrap().providerPlan?.managedTrafficRoute;
}

describe("managed traffic handoff connector protocol", () => {
  test("[RESIL-FENCE-005][RESIL-ROUTE-006] handoffs, reads authority, rejects replay, and explicitly fails back with a later epoch", async () => {
    let now = "2026-08-14T12:02:00.000Z";
    const target = harness({ now: () => now });
    const handoff = await planAcceptApply(
      target,
      "infrastructure.cluster.handoff-traffic",
      handoffParameters(),
    );
    expect(
      handoff.result._unsafeUnwrap().providerResult?.managedTrafficHandoffReceipt,
    ).toMatchObject({
      outcome: "moved",
      finalRoute: { activeTargetId: "target_sin", placementEpoch: 5 },
      executionSteps: [
        "route-read",
        "health-read",
        "previous-fenced",
        "route-moved",
        "authority-verified",
        "cleanup-complete",
      ],
    });
    expect(await trafficStatus(target)).toMatchObject({
      activeTargetId: "target_sin",
      placementEpoch: 5,
    });

    const replay = await target.apply.execute(target.context, {
      connectorKey: "managed-kubernetes",
      capabilityKey: "infrastructure.cluster.handoff-traffic",
      ownerRef,
      acceptedPlanId: handoff.accepted.acceptedPlanId,
      parameters: handoffParameters(),
    });
    expect(replay.isErr()).toBe(true);
    expect(replay._unsafeUnwrapErr().code).toBe("conflict");

    now = "2026-08-14T12:05:00.000Z";
    const failbackParameters = {
      action: "failback" as const,
      currentRoute: {
        ...currentRoute,
        activeEndpointRef: "endpoint:sin",
        activeTargetId: "target_sin",
        placementEpoch: 5,
        fencingToken: "fence_epoch_5",
      },
      currentEndpoint: {
        endpointRef: "endpoint:sin",
        workloadRef: "resource:api",
        targetId: "target_sin",
      },
      replacementEndpoint: {
        endpointRef: "endpoint:ewr",
        workloadRef: "resource:api",
        targetId: "target_ewr",
      },
      replacementHealth: {
        endpointRef: "endpoint:ewr",
        status: "healthy" as const,
        observedAt: "2026-08-14T12:03:00.000Z",
        validUntil: "2026-08-14T12:10:00.000Z",
        proofRef: "health-proof:ewr:43",
      },
      nextPlacementEpoch: 6,
      nextFencingToken: "fence_epoch_6",
      rollbackEndpointRef: "endpoint:sin",
      plannedAt: "2026-08-14T12:04:00.000Z",
    };
    const failback = await planAcceptApply(
      target,
      "infrastructure.cluster.failback-traffic",
      failbackParameters,
    );
    expect(
      failback.result._unsafeUnwrap().providerResult?.managedTrafficHandoffReceipt,
    ).toMatchObject({
      action: "failback",
      outcome: "moved",
      finalRoute: { activeTargetId: "target_ewr", placementEpoch: 6 },
    });
  });

  test("[RESIL-ROUTE-006] blocks expired health before effects and preserves live authority", async () => {
    const target = harness({ now: () => "2026-08-14T12:06:00.000Z" });
    const attempt = await planAcceptApply(
      target,
      "infrastructure.cluster.handoff-traffic",
      handoffParameters(),
    );
    expect(attempt.result.isErr()).toBe(true);
    expect(await trafficStatus(target)).toEqual(currentRoute);
  });

  test("[RESIL-ROUTE-006] reports preserved when execution stops before route movement", async () => {
    const target = harness({
      now: () => "2026-08-14T12:02:00.000Z",
      trafficFailureMode: "before-move",
    });
    const attempt = await planAcceptApply(
      target,
      "infrastructure.cluster.handoff-traffic",
      handoffParameters(),
    );
    expect(
      attempt.result._unsafeUnwrap().providerResult?.managedTrafficHandoffReceipt,
    ).toMatchObject({
      outcome: "preserved",
      finalRoute: currentRoute,
      rollbackAttempts: 0,
    });
    expect(await trafficStatus(target)).toEqual(currentRoute);
  });

  test("[RESIL-ROUTE-006][RESIL-CLEAN-008] rolls back once when moved authority cannot be verified", async () => {
    const target = harness({
      now: () => "2026-08-14T12:02:00.000Z",
      trafficFailureMode: "after-move",
    });
    const attempt = await planAcceptApply(
      target,
      "infrastructure.cluster.handoff-traffic",
      handoffParameters(),
    );
    expect(
      attempt.result._unsafeUnwrap().providerResult?.managedTrafficHandoffReceipt,
    ).toMatchObject({
      outcome: "rolled-back",
      finalRoute: currentRoute,
      rollbackAttempts: 1,
    });
    expect(await trafficStatus(target)).toEqual(currentRoute);
  });

  test("[RESIL-ROUTE-006] reports manual intervention when the only rollback cannot be verified", async () => {
    const target = harness({
      now: () => "2026-08-14T12:02:00.000Z",
      trafficFailureMode: "rollback-unverified",
    });
    const attempt = await planAcceptApply(
      target,
      "infrastructure.cluster.handoff-traffic",
      handoffParameters(),
    );
    expect(attempt.result._unsafeUnwrap()).toMatchObject({
      status: "conflict",
      providerResult: {
        managedTrafficHandoffReceipt: {
          outcome: "manual-intervention",
          rollbackAttempts: 1,
        },
      },
    });
  });
});
