import {
  domainError,
  err,
  InfrastructureServerProposal,
  type InfrastructureServerProposalSnapshot,
  ManagedCapacityCell,
  type ManagedCapacityCellProviderResourceDisposition,
  type ManagedCapacityCellSnapshot,
  type ManagedClusterCapabilityAction,
  ManagedClusterCapabilityPlan,
  ManagedClusterCapabilityReceipt,
  type ManagedClusterCapabilityReceiptSnapshot,
  type ManagedClusterPlacementDecisionSnapshot,
  ManagedClusterPlacementIntent,
  type ManagedClusterPlacementIntentSnapshot,
  type ManagedClusterPlacementMode,
  type ManagedClusterReplacementReadinessSnapshot,
  type ManagedClusterSupportLevel,
  ManagedClusterTargetPool,
  type ManagedClusterTargetPoolSnapshot,
  type ManagedTrafficHandoffAction,
  ManagedTrafficHandoffPlan,
  type ManagedTrafficHandoffPlanSnapshot,
  ManagedTrafficHandoffReceipt,
  type ManagedTrafficHandoffReceiptSnapshot,
  ManagedTrafficHealthEvidence,
  type ManagedTrafficRouteSnapshot,
  ok,
  type Result,
} from "@appaloft/core";

import { type ExecutionContext } from "../execution-context";
import {
  type ConnectorCapabilityApplyInput,
  type ConnectorCapabilityApplyResult,
  type ConnectorCapabilityPlanInput,
  type ConnectorCapabilityPlanPreview,
  type ConnectorProviderAdapter,
} from "../ports";

export interface FakeInfrastructureConnectorProviderAdapterOptions {
  connectorKey: string;
  providerKey: string;
  providerTitle: string;
  trafficRoutes?: readonly ManagedTrafficRouteSnapshot[];
  now?: () => string;
  trafficFailureMode?: "before-move" | "after-move" | "rollback-unverified";
}

export class FakeInfrastructureConnectorProviderAdapter implements ConnectorProviderAdapter {
  readonly connectorKey: string;
  private readonly providerKey: string;
  private readonly providerTitle: string;
  private readonly managedClusters = new Map<string, ManagedClusterCapabilityReceiptSnapshot>();
  private readonly trafficRoutes = new Map<string, ManagedTrafficRouteSnapshot>();
  private readonly now: () => string;
  private readonly trafficFailureMode?: FakeInfrastructureConnectorProviderAdapterOptions["trafficFailureMode"];

  constructor(options: FakeInfrastructureConnectorProviderAdapterOptions) {
    this.connectorKey = options.connectorKey;
    this.providerKey = options.providerKey;
    this.providerTitle = options.providerTitle;
    this.now = options.now ?? (() => new Date().toISOString());
    this.trafficFailureMode = options.trafficFailureMode;
    for (const route of options.trafficRoutes ?? []) {
      this.trafficRoutes.set(route.routeRef, { ...route });
    }
  }

  canPlan(capabilityKey: string): boolean {
    return (
      capabilityKey === "infrastructure.server.propose" ||
      managedTrafficAction(capabilityKey) !== null ||
      managedClusterAction(capabilityKey) !== null
    );
  }

  async planCapability(
    context: ExecutionContext,
    input: ConnectorCapabilityPlanInput,
  ): Promise<Result<ConnectorCapabilityPlanPreview>> {
    void context;
    if (!this.canPlan(input.capabilityKey)) {
      return err(
        domainError.validation(`Connector ${this.connectorKey} cannot plan ${input.capabilityKey}`),
      );
    }

    const trafficAction = managedTrafficAction(input.capabilityKey);
    if (trafficAction) {
      return this.planManagedTraffic(input, trafficAction);
    }

    const managedAction = managedClusterAction(input.capabilityKey);
    if (managedAction) {
      return this.planManagedCluster(input, managedAction);
    }

    const parameters = parseInfrastructureProposalParameters(
      this.providerKey,
      input.parameters ?? {},
    );
    if (parameters.isErr()) return err(parameters.error);
    const proposal = InfrastructureServerProposal.create(parameters.value);
    if (proposal.isErr()) return err(proposal.error);

    return ok(this.toPreview(input, proposal.value));
  }

  canApply(capabilityKey: string): boolean {
    const trafficAction = managedTrafficAction(capabilityKey);
    if (trafficAction) return trafficAction !== "status";
    const action = managedClusterAction(capabilityKey);
    return action !== null && action !== "inspect" && action !== "readiness";
  }

  async applyCapability(
    context: ExecutionContext,
    input: ConnectorCapabilityApplyInput,
  ): Promise<Result<ConnectorCapabilityApplyResult>> {
    void context;
    const trafficAction = managedTrafficAction(input.capabilityKey);
    if (trafficAction) {
      if (trafficAction === "status") {
        return err(
          domainError.validation(
            `Connector ${this.connectorKey} cannot apply ${input.capabilityKey}`,
          ),
        );
      }
      if (!input.acceptedPlanId || !input.acceptedPlan) {
        return err(
          domainError.conflict("Managed traffic mutation requires an accepted plan", {
            connectorKey: input.connectorKey,
            capabilityKey: input.capabilityKey,
          }),
        );
      }
      const reboundPlan = this.planManagedTraffic(input, trafficAction);
      if (reboundPlan.isErr()) return err(reboundPlan.error);
      if (reboundPlan.value.planId !== input.acceptedPlan.planId) {
        return err(
          domainError.conflict("Managed traffic apply parameters do not match the accepted plan", {
            acceptedPlanId: input.acceptedPlanId,
            acceptedPlanRef: input.acceptedPlan.planId,
            currentPlanRef: reboundPlan.value.planId,
          }),
        );
      }
      const plan = ManagedTrafficHandoffPlan.create(
        reboundPlan.value.providerPlan
          ?.managedTrafficHandoffPlan as ManagedTrafficHandoffPlanSnapshot,
      );
      if (plan.isErr()) return err(plan.error);
      return this.applyManagedTraffic(input, plan.value);
    }

    const action = managedClusterAction(input.capabilityKey);
    if (!action || action === "inspect" || action === "readiness") {
      return err(
        domainError.validation(
          `Connector ${this.connectorKey} cannot apply ${input.capabilityKey}`,
        ),
      );
    }
    if (!input.acceptedPlanId || !input.acceptedPlan) {
      return err(
        domainError.conflict("Managed cluster mutation requires an accepted plan", {
          connectorKey: input.connectorKey,
          capabilityKey: input.capabilityKey,
        }),
      );
    }
    const reboundPlan = this.planManagedCluster(input, action);
    if (reboundPlan.isErr()) return err(reboundPlan.error);
    if (reboundPlan.value.planId !== input.acceptedPlan.planId) {
      return err(
        domainError.conflict("Managed cluster apply parameters do not match the accepted plan", {
          acceptedPlanId: input.acceptedPlanId,
          acceptedPlanRef: input.acceptedPlan.planId,
          currentPlanRef: reboundPlan.value.planId,
        }),
      );
    }
    return this.applyManagedCluster(input, action);
  }

  private planManagedTraffic(
    input: ConnectorCapabilityPlanInput,
    action: ManagedTrafficHandoffAction | "status",
  ): Result<ConnectorCapabilityPlanPreview> {
    if (action === "status") {
      const routeRef = requiredParameter(input.parameters?.routeRef, "Managed traffic route ref");
      if (routeRef.isErr()) return err(routeRef.error);
      const route = this.trafficRoutes.get(routeRef.value);
      if (!route) return err(domainError.notFound("ManagedTrafficRoute", routeRef.value));
      return ok({
        planId: `trafficplan_${stableHash({ ...input, route })}`,
        connectorKey: input.connectorKey,
        capabilityKey: input.capabilityKey,
        riskLevel: "low",
        requiresExplicitAcceptance: false,
        summary: `${this.providerTitle}: ${route.routeRef} routes to ${route.activeEndpointRef} at epoch ${route.placementEpoch}.`,
        effects: [
          {
            kind: "infrastructure.cluster.traffic-status",
            title: `Read ${route.routeRef} traffic authority`,
            description: "Status planning performs no traffic mutation.",
          },
        ],
        cleanup: { supported: false, description: "Status planning creates no resources." },
        providerPlan: { kind: "managed-traffic-route", managedTrafficRoute: { ...route } },
      });
    }

    const plan = ManagedTrafficHandoffPlan.create({
      ...(input.parameters as unknown as ManagedTrafficHandoffPlanSnapshot),
      action,
    });
    if (plan.isErr()) return err(plan.error);
    const snapshot = plan.value.toJSON();
    const liveRoute = this.trafficRoutes.get(snapshot.currentRoute.routeRef);
    if (!liveRoute || !plan.value.matchesLiveRoute(liveRoute)) {
      return err(
        domainError.conflict("Managed traffic route authority changed before planning", {
          routeRef: snapshot.currentRoute.routeRef,
        }),
      );
    }
    return ok({
      planId: `trafficplan_${stableHash({
        connectorKey: input.connectorKey,
        capabilityKey: input.capabilityKey,
        ownerRef: input.ownerRef,
        plan: snapshot,
      })}`,
      connectorKey: input.connectorKey,
      capabilityKey: input.capabilityKey,
      riskLevel: "high",
      requiresExplicitAcceptance: true,
      summary: `${this.providerTitle}: ${action} ${snapshot.currentRoute.routeRef} to ${snapshot.replacementEndpoint.endpointRef}.`,
      effects: [
        {
          kind: `infrastructure.cluster.${action === "handoff" ? "handoff-traffic" : "failback-traffic"}`,
          title: `${action} ${snapshot.currentRoute.routeRef}`,
          description: `Fence epoch ${snapshot.currentRoute.placementEpoch}; move and verify epoch ${snapshot.nextPlacementEpoch}.`,
        },
      ],
      cleanup: {
        supported: true,
        description: "Rollback and cleanup are bounded to the accepted route and endpoint refs.",
      },
      providerPlan: { kind: "managed-traffic-handoff", managedTrafficHandoffPlan: snapshot },
    });
  }

  private applyManagedTraffic(
    input: ConnectorCapabilityApplyInput,
    plan: ManagedTrafficHandoffPlan,
  ): Result<ConnectorCapabilityApplyResult> {
    const snapshot = plan.toJSON();
    const liveRoute = this.trafficRoutes.get(snapshot.currentRoute.routeRef);
    if (!liveRoute || !plan.matchesLiveRoute(liveRoute)) {
      return err(
        domainError.conflict("Managed traffic live route does not match the accepted plan", {
          routeRef: snapshot.currentRoute.routeRef,
        }),
      );
    }
    const health = ManagedTrafficHealthEvidence.create(snapshot.replacementHealth);
    if (health.isErr()) return err(health.error);
    if (!health.value.isHealthy() || !health.value.isFreshAt(this.now())) {
      return err(
        domainError.conflict("Managed traffic replacement health is no longer fresh", {
          routeRef: snapshot.currentRoute.routeRef,
          endpointRef: snapshot.replacementEndpoint.endpointRef,
        }),
      );
    }
    const operationId = `trafficop_${stableHash({ ...input, plan: snapshot })}`;
    const baseSteps = ["route-read", "health-read"];
    if (this.trafficFailureMode === "before-move") {
      return this.toTrafficApplyResult(
        input,
        ManagedTrafficHandoffReceipt.create({
          operationId,
          action: snapshot.action,
          outcome: "preserved",
          previousRoute: liveRoute,
          finalRoute: liveRoute,
          healthEvidence: snapshot.replacementHealth,
          executionSteps: [...baseSteps, "move-precondition-failed", "cleanup-complete"],
          rollbackAttempts: 0,
          cleanup: { residualOwnedResources: 0, transientResourceRefs: [] },
        })
          ._unsafeUnwrap()
          .toJSON(),
      );
    }

    const movedRoute = plan.movedRoute();
    this.trafficRoutes.set(movedRoute.routeRef, movedRoute);
    const movedSteps = [...baseSteps, "previous-fenced", "route-moved"];
    if (
      this.trafficFailureMode === "after-move" ||
      this.trafficFailureMode === "rollback-unverified"
    ) {
      const rollbackVerified = this.trafficFailureMode === "after-move";
      if (rollbackVerified) this.trafficRoutes.set(liveRoute.routeRef, { ...liveRoute });
      const receipt = ManagedTrafficHandoffReceipt.create({
        operationId,
        action: snapshot.action,
        outcome: rollbackVerified ? "rolled-back" : "manual-intervention",
        previousRoute: liveRoute,
        ...(rollbackVerified ? { finalRoute: liveRoute } : {}),
        healthEvidence: snapshot.replacementHealth,
        executionSteps: [
          ...movedSteps,
          "authority-verification-failed",
          "rollback-moved",
          rollbackVerified ? "rollback-verified" : "rollback-verification-failed",
          "cleanup-complete",
        ],
        rollbackAttempts: 1,
        cleanup: { residualOwnedResources: 0, transientResourceRefs: [] },
      });
      if (receipt.isErr()) return err(receipt.error);
      return this.toTrafficApplyResult(input, receipt.value.toJSON());
    }

    const observedRoute = this.trafficRoutes.get(movedRoute.routeRef);
    if (!observedRoute || JSON.stringify(observedRoute) !== JSON.stringify(movedRoute)) {
      return err(domainError.conflict("Managed traffic authority verification failed"));
    }
    const receipt = ManagedTrafficHandoffReceipt.create({
      operationId,
      action: snapshot.action,
      outcome: "moved",
      previousRoute: liveRoute,
      finalRoute: observedRoute,
      healthEvidence: snapshot.replacementHealth,
      executionSteps: [...movedSteps, "authority-verified", "cleanup-complete"],
      rollbackAttempts: 0,
      cleanup: { residualOwnedResources: 0, transientResourceRefs: [] },
    });
    if (receipt.isErr()) return err(receipt.error);
    return this.toTrafficApplyResult(input, receipt.value.toJSON());
  }

  private toTrafficApplyResult(
    input: ConnectorCapabilityApplyInput,
    receipt: ManagedTrafficHandoffReceiptSnapshot,
  ): Result<ConnectorCapabilityApplyResult> {
    const verified = receipt.outcome === "moved";
    return ok({
      operationId: receipt.operationId,
      connectorKey: input.connectorKey,
      capabilityKey: input.capabilityKey,
      status: verified ? "verified" : "conflict",
      summary: `${this.providerTitle}: traffic handoff outcome is ${receipt.outcome}.`,
      effects: [
        {
          kind: `traffic.handoff.${receipt.outcome}`,
          title: `Traffic ${receipt.outcome}`,
          description: `Rollback attempts: ${receipt.rollbackAttempts}; residual owned resources: ${receipt.cleanup.residualOwnedResources}.`,
          managed: true,
        },
      ],
      providerResult: {
        kind: "managed-traffic-handoff-receipt",
        managedTrafficHandoffReceipt: receipt,
      },
    });
  }

  private planManagedCluster(
    input: ConnectorCapabilityPlanInput,
    action: ManagedClusterCapabilityAction,
  ): Result<ConnectorCapabilityPlanPreview> {
    if (action === "readiness") {
      const readiness = parseReplacementReadiness(input.parameters ?? {});
      if (readiness.isErr()) return err(readiness.error);
      return ok({
        planId: managedPlanId(input, readiness.value),
        connectorKey: input.connectorKey,
        capabilityKey: input.capabilityKey,
        riskLevel: "low",
        requiresExplicitAcceptance: false,
        summary: `${this.providerTitle}: replacement capacity is ${readiness.value.status} for ${readiness.value.workloadRef}.`,
        effects: [
          {
            kind: "infrastructure.cluster.readiness",
            title: `Replacement capacity ${readiness.value.status}`,
            description:
              readiness.value.status === "ready"
                ? `${readiness.value.totalEligibleReplacementCapacity} capacity units are eligible across ${readiness.value.eligibleReplacementTargetIds.length} replacement targets.`
                : readiness.value.reasonCodes.join(", "),
          },
        ],
        cleanup: {
          supported: false,
          description: "Readiness planning does not create or reserve resources.",
        },
        providerPlan: {
          kind: "managed-cluster-replacement-readiness",
          managedClusterReplacementReadiness: readiness.value,
        },
      });
    }

    if (action === "inspect") {
      const clusterRef = requiredParameter(input.parameters?.clusterRef, "Managed cluster ref");
      if (clusterRef.isErr()) return err(clusterRef.error);
      const receipt = this.managedClusters.get(clusterRef.value);
      if (!receipt) return err(domainError.notFound("ManagedCluster", clusterRef.value));
      return ok({
        planId: managedPlanId(input, receipt),
        connectorKey: input.connectorKey,
        capabilityKey: input.capabilityKey,
        riskLevel: "low",
        requiresExplicitAcceptance: false,
        summary: `${this.providerTitle}: managed cluster ${clusterRef.value} is ${receipt.status}.`,
        effects: [{ kind: "infrastructure.cluster.inspect", title: `Inspect ${clusterRef.value}` }],
        cleanup: {
          supported: receipt.cleanup.supported,
          description: `${receipt.cleanup.residualOwnedResources} residual owned resources reported.`,
        },
        providerPlan: { kind: "managed-cluster-readback", managedClusterReceipt: receipt },
      });
    }

    if (["place", "failover", "recover"].includes(action)) {
      const placement = parsePlacement(input.parameters ?? {}, action);
      if (placement.isErr()) return err(placement.error);
      return ok({
        planId: managedPlanId(input, placement.value),
        connectorKey: input.connectorKey,
        capabilityKey: input.capabilityKey,
        riskLevel: action === "place" ? "medium" : "high",
        requiresExplicitAcceptance: true,
        summary: `${this.providerTitle}: ${action} ${placement.value.workloadRef} on ${placement.value.selectedTargetId}.`,
        effects: [
          {
            kind: `infrastructure.cluster.${action}`,
            title: `${action} ${placement.value.workloadRef}`,
            description: `Select ${placement.value.selectedTargetId}; placement epoch ${placement.value.placementEpoch}.`,
          },
          {
            kind: "infrastructure.cluster.fence",
            title: `Fence placement epoch ${placement.value.placementEpoch}`,
            description: "The prior placement may not write after the new epoch is accepted.",
          },
        ],
        cleanup: {
          supported: true,
          description: "Cleanup is bounded to resources named by the accepted placement receipt.",
        },
        providerPlan: {
          kind: "managed-cluster-placement",
          managedClusterPlacement: placement.value,
        },
      });
    }

    const plan = parseManagedClusterPlan(
      this.providerKey,
      action,
      input.parameters ?? {},
      this.managedClusters,
    );
    if (plan.isErr()) return err(plan.error);
    const snapshot = plan.value.toJSON();
    return ok({
      planId: managedPlanId(input, snapshot),
      connectorKey: input.connectorKey,
      capabilityKey: input.capabilityKey,
      riskLevel: action === "cleanup-orphans" ? "medium" : "high",
      requiresExplicitAcceptance: true,
      summary: `${this.providerTitle}: ${action} managed cluster ${snapshot.clusterName ?? snapshot.clusterRef}.`,
      effects: [
        {
          kind: `infrastructure.cluster.${action}`,
          title: `${action} ${snapshot.clusterName ?? snapshot.clusterRef}`,
          description:
            action === "provision"
              ? `Estimated monthly cost: $${snapshot.estimatedMonthlyCostUsd ?? "unknown"} ${snapshot.currency}.`
              : "Mutation is limited to the accepted managed cluster reference.",
        },
      ],
      cleanup: {
        supported: snapshot.cleanupSupported,
        description: snapshot.cleanupSupported
          ? "The provider adapter must return residual-resource evidence after cleanup."
          : "Provider cleanup is unavailable.",
      },
      providerPlan: { kind: "managed-cluster-capability-plan", managedClusterPlan: snapshot },
    });
  }

  private applyManagedCluster(
    input: ConnectorCapabilityApplyInput,
    action: Exclude<ManagedClusterCapabilityAction, "inspect" | "readiness">,
  ): Result<ConnectorCapabilityApplyResult> {
    if (["place", "failover", "recover"].includes(action)) {
      const placement = parsePlacement(input.parameters ?? {}, action);
      if (placement.isErr()) return err(placement.error);
      const operationId = `clusterop_${stableHash({ ...input, placement: placement.value })}`;
      const receipt = ManagedClusterCapabilityReceipt.create({
        operationId,
        action,
        providerKey: placement.value.selectedProviderKey,
        clusterRef: placement.value.workloadRef,
        status: "ready",
        region: placement.value.selectedRegion,
        targetPoolId: placement.value.poolId,
        targetId: placement.value.selectedTargetId,
        support: { level: "standard" },
        cost: { currency: "USD" },
        cleanup: { supported: true, residualOwnedResources: 0, orphanResourceRefs: [] },
        placement: placement.value,
      });
      if (receipt.isErr()) return err(receipt.error);
      return ok(this.toManagedApplyResult(input, receipt.value.toJSON(), "verified"));
    }

    const plan = parseManagedClusterPlan(
      this.providerKey,
      action,
      input.parameters ?? {},
      this.managedClusters,
    );
    if (plan.isErr()) return err(plan.error);
    const snapshot = plan.value.toJSON();
    const clusterRef =
      snapshot.capacityCell?.clusterRef ??
      snapshot.clusterRef ??
      `cluster_${stableHash({ providerKey: snapshot.providerKey, clusterName: snapshot.clusterName, region: snapshot.region })}`;
    const operationId = `clusterop_${stableHash({ ...input, clusterRef })}`;

    if (action === "delete") {
      const previous = this.managedClusters.get(clusterRef);
      if (!previous) return err(domainError.notFound("ManagedCluster", clusterRef));
      const cell = previous.capacityCell
        ? ManagedCapacityCell.create(previous.capacityCell)
        : err(domainError.conflict("Managed cluster has no capacity cell lifecycle snapshot"));
      if (cell.isErr()) return err(cell.error);
      const deletedCell = cell.value.delete();
      if (deletedCell.isErr()) return err(deletedCell.error);
      const receipt = ManagedClusterCapabilityReceipt.create({
        ...previous,
        operationId,
        action,
        status: "deleted",
        capacityCell: cell.value.toJSON(),
        cleanup: { supported: true, residualOwnedResources: 0, orphanResourceRefs: [] },
      });
      if (receipt.isErr()) return err(receipt.error);
      this.managedClusters.delete(clusterRef);
      return ok(this.toManagedApplyResult(input, receipt.value.toJSON(), "cleaned-up"));
    }

    if (action === "drain") {
      const previous = this.managedClusters.get(clusterRef);
      if (!previous) return err(domainError.notFound("ManagedCluster", clusterRef));
      const cell = previous.capacityCell
        ? ManagedCapacityCell.create(previous.capacityCell)
        : err(domainError.conflict("Managed cluster has no capacity cell lifecycle snapshot"));
      if (cell.isErr()) return err(cell.error);
      const drained = cell.value.startDrain();
      if (drained.isErr()) return err(drained.error);
      const receipt = ManagedClusterCapabilityReceipt.create({
        ...previous,
        operationId,
        action,
        capacityCell: cell.value.toJSON(),
      });
      if (receipt.isErr()) return err(receipt.error);
      this.managedClusters.set(clusterRef, receipt.value.toJSON());
      return ok(this.toManagedApplyResult(input, receipt.value.toJSON(), "applied"));
    }

    if (action === "cleanup-orphans") {
      const previous = this.managedClusters.get(clusterRef);
      if (!previous) return err(domainError.notFound("ManagedCluster", clusterRef));
      const receipt = ManagedClusterCapabilityReceipt.create({
        ...previous,
        operationId,
        action,
        cleanup: { supported: true, residualOwnedResources: 0, orphanResourceRefs: [] },
      });
      if (receipt.isErr()) return err(receipt.error);
      this.managedClusters.set(clusterRef, receipt.value.toJSON());
      return ok(this.toManagedApplyResult(input, receipt.value.toJSON(), "cleaned-up"));
    }

    const receipt = ManagedClusterCapabilityReceipt.create({
      operationId,
      action,
      providerKey: snapshot.providerKey,
      clusterRef,
      ...(snapshot.clusterName ? { clusterName: snapshot.clusterName } : {}),
      status: "ready",
      ...(snapshot.region ? { region: snapshot.region } : {}),
      ...(snapshot.clusterClass ? { clusterClass: snapshot.clusterClass } : {}),
      ...(snapshot.targetPoolId ? { targetPoolId: snapshot.targetPoolId } : {}),
      support: { level: snapshot.supportLevel },
      cost: {
        currency: "USD",
        ...(snapshot.estimatedMonthlyCostUsd !== undefined
          ? { estimatedMonthlyAmount: snapshot.estimatedMonthlyCostUsd }
          : {}),
      },
      cleanup: {
        supported: snapshot.cleanupSupported,
        residualOwnedResources: 0,
        orphanResourceRefs: [],
      },
      ...(snapshot.capacityCell ? { capacityCell: snapshot.capacityCell } : {}),
    });
    if (receipt.isErr()) return err(receipt.error);
    this.managedClusters.set(clusterRef, receipt.value.toJSON());
    return ok(this.toManagedApplyResult(input, receipt.value.toJSON(), "applied"));
  }

  private toManagedApplyResult(
    input: ConnectorCapabilityApplyInput,
    receipt: ManagedClusterCapabilityReceiptSnapshot,
    status: ConnectorCapabilityApplyResult["status"],
  ): ConnectorCapabilityApplyResult {
    return {
      operationId: receipt.operationId,
      connectorKey: input.connectorKey,
      capabilityKey: input.capabilityKey,
      status,
      summary: `${this.providerTitle}: ${receipt.action} ${receipt.clusterRef} is ${receipt.status}.`,
      effects: [
        {
          kind: `infrastructure.cluster.${receipt.action}.${receipt.status}`,
          title: `${receipt.action} ${receipt.clusterRef}`,
          description: `Residual owned resources: ${receipt.cleanup.residualOwnedResources}.`,
          managed: true,
        },
      ],
      providerResult: { kind: "managed-cluster-receipt", managedClusterReceipt: receipt },
    };
  }

  private toPreview(
    input: ConnectorCapabilityPlanInput,
    proposal: InfrastructureServerProposal,
  ): ConnectorCapabilityPlanPreview {
    const infrastructureServerProposal = proposal.toJSON();
    const planId = `infraplan_${stableHash({
      connectorKey: input.connectorKey,
      capabilityKey: input.capabilityKey,
      ownerRef: input.ownerRef,
      infrastructureServerProposal,
    })}`;

    return {
      planId,
      connectorKey: input.connectorKey,
      capabilityKey: input.capabilityKey,
      riskLevel: proposal.riskLevel(),
      requiresExplicitAcceptance: proposal.requiresExplicitAcceptance(),
      summary: `${this.providerTitle}: ${proposal.summary()}`,
      effects: [
        {
          kind: "infrastructure.server.propose",
          title: proposal.title(),
          description: proposal.description(),
        },
        {
          kind: "infrastructure.cost.estimate",
          title: `Cost risk: ${proposal.riskLevel()}`,
          description:
            infrastructureServerProposal.estimatedMonthlyCostUsd === undefined
              ? "No monthly estimate was supplied by the provider adapter."
              : `Estimated monthly cost is $${infrastructureServerProposal.estimatedMonthlyCostUsd.toFixed(2)}.`,
        },
      ],
      cleanup: {
        supported: infrastructureServerProposal.cleanupSupported,
        description: infrastructureServerProposal.cleanupSupported
          ? "Cleanup requires the accepted server creation readback."
          : "Cleanup is not available for this proposal.",
      },
      providerPlan: {
        kind: "infrastructure-server-proposal",
        infrastructureServerProposal,
      },
    };
  }
}

function managedClusterAction(capabilityKey: string): ManagedClusterCapabilityAction | null {
  const prefix = "infrastructure.cluster.";
  if (!capabilityKey.startsWith(prefix)) return null;
  const action = capabilityKey.slice(prefix.length);
  return [
    "provision",
    "import",
    "inspect",
    "readiness",
    "drain",
    "delete",
    "place",
    "failover",
    "recover",
    "cleanup-orphans",
  ].includes(action)
    ? (action as ManagedClusterCapabilityAction)
    : null;
}

function managedTrafficAction(
  capabilityKey: string,
): ManagedTrafficHandoffAction | "status" | null {
  if (capabilityKey === "infrastructure.cluster.handoff-traffic") return "handoff";
  if (capabilityKey === "infrastructure.cluster.failback-traffic") return "failback";
  if (capabilityKey === "infrastructure.cluster.traffic-status") return "status";
  return null;
}

function parseManagedClusterPlan(
  providerKey: string,
  action: ManagedClusterCapabilityAction,
  parameters: Record<string, unknown>,
  clusters: ReadonlyMap<string, ManagedClusterCapabilityReceiptSnapshot>,
): Result<ManagedClusterCapabilityPlan> {
  const clusterRef = optionalParameter(parameters.clusterRef);
  if (["drain", "delete", "cleanup-orphans"].includes(action)) {
    const requiredClusterRef = requiredParameter(clusterRef, "Managed cluster ref");
    if (requiredClusterRef.isErr()) return err(requiredClusterRef.error);
    const existing = clusters.get(requiredClusterRef.value);
    if (!existing) return err(domainError.notFound("ManagedCluster", requiredClusterRef.value));
    return ManagedClusterCapabilityPlan.create({
      action,
      providerKey: existing.providerKey,
      clusterRef: requiredClusterRef.value,
      ...(existing.clusterName ? { clusterName: existing.clusterName } : {}),
      ...(existing.region ? { region: existing.region } : {}),
      ...(existing.clusterClass ? { clusterClass: existing.clusterClass } : {}),
      ...(existing.targetPoolId ? { targetPoolId: existing.targetPoolId } : {}),
      ...(existing.cost.estimatedMonthlyAmount !== undefined
        ? { estimatedMonthlyCostUsd: existing.cost.estimatedMonthlyAmount }
        : {}),
      currency: "USD",
      supportLevel: existing.support.level,
      cleanupSupported: existing.cleanup.supported,
      requiredCapabilities: [],
      ...(existing.capacityCell ? { capacityCell: existing.capacityCell } : {}),
    });
  }

  const supportLevel = optionalParameter(parameters.supportLevel) ?? "standard";
  if (!["community", "standard", "premium"].includes(supportLevel)) {
    return err(domainError.validation(`Unsupported managed cluster support level ${supportLevel}`));
  }
  const estimatedMonthlyCostUsd = optionalNumber(parameters.estimatedMonthlyCostUsd);
  if (estimatedMonthlyCostUsd.isErr()) return err(estimatedMonthlyCostUsd.error);
  const requiredCapabilities = optionalStringArray(parameters.requiredCapabilities);
  if (requiredCapabilities.isErr()) return err(requiredCapabilities.error);
  const clusterName = optionalParameter(parameters.clusterName);
  const region = optionalParameter(parameters.region);
  const clusterClass = optionalParameter(parameters.clusterClass);
  const targetPoolId = optionalParameter(parameters.targetPoolId);

  let capacityCell: ManagedCapacityCellSnapshot | undefined;
  if (action === "provision" || action === "import") {
    if (
      parameters.capacityCell &&
      typeof parameters.capacityCell === "object" &&
      !Array.isArray(parameters.capacityCell)
    ) {
      const suppliedCell = ManagedCapacityCell.create(
        parameters.capacityCell as ManagedCapacityCellSnapshot,
      );
      if (suppliedCell.isErr()) return err(suppliedCell.error);
      const suppliedSnapshot = suppliedCell.value.toJSON();
      if (
        suppliedSnapshot.providerKey !== providerKey ||
        suppliedSnapshot.origin !== (action === "import" ? "imported" : "provisioned")
      ) {
        return err(
          domainError.conflict("Managed capacity cell does not match the requested capability"),
        );
      }
      capacityCell = suppliedSnapshot;
    }
  }
  if ((action === "provision" || action === "import") && !capacityCell) {
    const targetId = requiredParameter(parameters.targetId, "Managed capacity cell target id");
    if (targetId.isErr()) return err(targetId.error);
    const requiredTargetPoolId = requiredParameter(
      targetPoolId,
      "Managed capacity cell target pool id",
    );
    if (requiredTargetPoolId.isErr()) return err(requiredTargetPoolId.error);
    const requiredRegion = requiredParameter(region, "Managed capacity cell region");
    if (requiredRegion.isErr()) return err(requiredRegion.error);
    const failureDomains = parseFailureDomains(parameters.failureDomains);
    if (failureDomains.isErr()) return err(failureDomains.error);
    const availableCapacity = optionalIntegerParameter(
      parameters.availableCapacity,
      "Managed capacity cell available capacity",
      0,
    );
    if (availableCapacity.isErr()) return err(availableCapacity.error);
    const activePlacementCount = optionalIntegerParameter(
      parameters.activePlacementCount,
      "Managed capacity cell active placement count",
      0,
    );
    if (activePlacementCount.isErr()) return err(activePlacementCount.error);
    const requiredClusterRef =
      action === "import"
        ? requiredParameter(clusterRef, "Managed cluster ref")
        : ok(
            `cluster_${stableHash({
              providerKey,
              clusterName,
              region: requiredRegion.value,
              targetId: targetId.value,
            })}`,
          );
    if (requiredClusterRef.isErr()) return err(requiredClusterRef.error);
    const requestedDisposition =
      optionalParameter(parameters.providerResourceDisposition) ??
      (action === "import" ? "retain" : "delete");
    if (!(["delete", "retain"] as const).includes(requestedDisposition as never)) {
      return err(
        domainError.validation(
          `Unsupported managed capacity cell provider resource disposition ${requestedDisposition}`,
        ),
      );
    }
    const cell = ManagedCapacityCell.create({
      clusterRef: requiredClusterRef.value,
      targetId: targetId.value,
      targetPoolId: requiredTargetPoolId.value,
      providerKey,
      ...(clusterName ? { clusterName } : {}),
      region: requiredRegion.value,
      failureDomains: failureDomains.value,
      origin: action === "import" ? "imported" : "provisioned",
      lifecycleStatus: "accepting",
      providerResourceDisposition:
        requestedDisposition as ManagedCapacityCellProviderResourceDisposition,
      capabilities: requiredCapabilities.value,
      availableCapacity: availableCapacity.value,
      activePlacementCount: activePlacementCount.value,
      ...(estimatedMonthlyCostUsd.value !== undefined
        ? { estimatedMonthlyCostUsd: estimatedMonthlyCostUsd.value }
        : {}),
      supportLevel: supportLevel as ManagedClusterSupportLevel,
    });
    if (cell.isErr()) return err(cell.error);
    capacityCell = cell.value.toJSON();
  }

  return ManagedClusterCapabilityPlan.create({
    action,
    providerKey,
    ...(clusterName ? { clusterName } : {}),
    ...(capacityCell?.clusterRef
      ? { clusterRef: capacityCell.clusterRef }
      : clusterRef
        ? { clusterRef }
        : {}),
    ...(region ? { region } : {}),
    ...(clusterClass ? { clusterClass } : {}),
    ...(targetPoolId ? { targetPoolId } : {}),
    ...(estimatedMonthlyCostUsd.value !== undefined
      ? { estimatedMonthlyCostUsd: estimatedMonthlyCostUsd.value }
      : {}),
    currency: "USD",
    supportLevel: supportLevel as ManagedClusterSupportLevel,
    cleanupSupported: parameters.cleanupSupported !== false,
    requiredCapabilities: requiredCapabilities.value,
    ...(capacityCell ? { capacityCell } : {}),
  });
}

function parseFailureDomains(
  value: unknown,
): Result<ManagedCapacityCellSnapshot["failureDomains"]> {
  if (!Array.isArray(value)) {
    return err(domainError.validation("Managed capacity cell failure domains are required"));
  }
  if (
    value.some(
      (entry) =>
        !entry ||
        typeof entry !== "object" ||
        Array.isArray(entry) ||
        typeof (entry as { kind?: unknown }).kind !== "string" ||
        typeof (entry as { key?: unknown }).key !== "string",
    )
  ) {
    return err(domainError.validation("Managed capacity cell failure domains are invalid"));
  }
  return ok(value as ManagedCapacityCellSnapshot["failureDomains"]);
}

function optionalIntegerParameter(value: unknown, label: string, fallback: number): Result<number> {
  if (value === undefined) return ok(fallback);
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? ok(value)
    : err(domainError.validation(`${label} must be a non-negative integer`));
}

function parsePlacement(
  parameters: Record<string, unknown>,
  action: ManagedClusterCapabilityAction,
): Result<ManagedClusterPlacementDecisionSnapshot> {
  if (!["place", "failover", "recover"].includes(action)) {
    return err(domainError.validation(`Managed cluster ${action} is not a placement action`));
  }
  if (
    !parameters.targetPool ||
    typeof parameters.targetPool !== "object" ||
    Array.isArray(parameters.targetPool)
  ) {
    return err(domainError.validation("Managed cluster target pool is required"));
  }
  if (
    !parameters.placementIntent ||
    typeof parameters.placementIntent !== "object" ||
    Array.isArray(parameters.placementIntent)
  ) {
    return err(domainError.validation("Managed cluster placement intent is required"));
  }
  const pool = ManagedClusterTargetPool.create(
    parameters.targetPool as ManagedClusterTargetPoolSnapshot,
  );
  if (pool.isErr()) return err(pool.error);
  const intent = ManagedClusterPlacementIntent.create(
    parameters.placementIntent as ManagedClusterPlacementIntentSnapshot,
  );
  if (intent.isErr()) return err(intent.error);
  const mode =
    optionalParameter(parameters.mode) ??
    (action === "place" ? "initial" : action === "recover" ? "recovery" : "failover");
  if (!["initial", "failover", "recovery"].includes(mode)) {
    return err(domainError.validation(`Unsupported managed cluster placement mode ${mode}`));
  }
  const attempt = parameters.attempt ?? 0;
  if (typeof attempt !== "number" || !Number.isInteger(attempt)) {
    return err(domainError.validation("Managed cluster placement attempt must be an integer"));
  }
  const decision = pool.value.decidePlacement(intent.value, {
    mode: mode as ManagedClusterPlacementMode,
    attempt,
  });
  return decision.map((value) => value.toJSON());
}

function parseReplacementReadiness(
  parameters: Record<string, unknown>,
): Result<ManagedClusterReplacementReadinessSnapshot> {
  if (
    !parameters.targetPool ||
    typeof parameters.targetPool !== "object" ||
    Array.isArray(parameters.targetPool)
  ) {
    return err(domainError.validation("Managed cluster target pool is required"));
  }
  if (
    !parameters.placementIntent ||
    typeof parameters.placementIntent !== "object" ||
    Array.isArray(parameters.placementIntent)
  ) {
    return err(domainError.validation("Managed cluster placement intent is required"));
  }
  const pool = ManagedClusterTargetPool.create(
    parameters.targetPool as ManagedClusterTargetPoolSnapshot,
  );
  if (pool.isErr()) return err(pool.error);
  const intent = ManagedClusterPlacementIntent.create(
    parameters.placementIntent as ManagedClusterPlacementIntentSnapshot,
  );
  if (intent.isErr()) return err(intent.error);
  return pool.value.checkReplacementReadiness(intent.value).map((value) => value.toJSON());
}

function managedPlanId(input: ConnectorCapabilityPlanInput, providerPlan: unknown): string {
  return `clusterplan_${stableHash({
    connectorKey: input.connectorKey,
    capabilityKey: input.capabilityKey,
    ownerRef: input.ownerRef,
    providerPlan,
  })}`;
}

function requiredParameter(value: unknown, label: string): Result<string> {
  const normalized = optionalParameter(value);
  return normalized ? ok(normalized) : err(domainError.validation(`${label} is required`));
}

function optionalParameter(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalNumber(value: unknown): Result<number | undefined> {
  if (value === undefined) return ok(undefined);
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? ok(value)
    : err(domainError.validation("Managed cluster numeric parameter must be non-negative"));
}

function optionalStringArray(value: unknown): Result<string[]> {
  if (value === undefined) return ok([]);
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    return err(domainError.validation("Managed cluster capabilities must be a string array"));
  }
  return ok(value as string[]);
}

function parseInfrastructureProposalParameters(
  providerKey: string,
  parameters: Record<string, unknown>,
): Result<InfrastructureServerProposalSnapshot> {
  const region = optionalString(parameters.region, "ewr");
  const size = optionalString(parameters.size, "vc2-1c-1gb");
  const image = optionalString(parameters.image, "ubuntu-24.04");
  const recommendedServerName = optionalString(
    parameters.serverName ?? parameters.name,
    "appaloft-edge-1",
  );
  const osUser = optionalString(parameters.osUser, "root");
  const sshPort = optionalInteger(parameters.sshPort, 22);
  if (sshPort.isErr()) return err(sshPort.error);
  const estimatedMonthlyCostUsd = optionalCost(parameters.estimatedMonthlyCostUsd, size);
  if (estimatedMonthlyCostUsd.isErr()) return err(estimatedMonthlyCostUsd.error);
  const sshPublicKeyRef =
    typeof parameters.sshPublicKeyRef === "string" && parameters.sshPublicKeyRef.trim()
      ? parameters.sshPublicKeyRef.trim()
      : undefined;

  return ok({
    providerKey,
    region,
    size,
    image,
    recommendedServerName,
    osUser,
    sshPort: sshPort.value,
    ...(sshPublicKeyRef ? { sshPublicKeyRef } : {}),
    ...(estimatedMonthlyCostUsd.value !== undefined
      ? { estimatedMonthlyCostUsd: estimatedMonthlyCostUsd.value }
      : {}),
    costRiskLevel: costRiskLevel(estimatedMonthlyCostUsd.value),
    cleanupSupported: true,
    notes: [
      "This is a provider proposal only; no server is created until an accepted-plan command exists.",
      "The proposal must be reviewed by a human or operator before any paid resource mutation.",
    ],
    tags: ["appaloft", "connector", providerKey],
  });
}

function optionalString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function optionalInteger(value: unknown, fallback: number): Result<number> {
  if (value === undefined) return ok(fallback);
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return err(domainError.validation("Infrastructure numeric parameter must be an integer"));
  }
  return ok(value);
}

function optionalCost(value: unknown, size: string): Result<number | undefined> {
  if (value === undefined) {
    return ok(defaultMonthlyCost(size));
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return err(domainError.validation("Infrastructure monthly cost must be non-negative"));
  }
  return ok(value);
}

function defaultMonthlyCost(size: string): number | undefined {
  const costs: Record<string, number> = {
    "vc2-1c-1gb": 6,
    "vc2-1c-2gb": 12,
    "vc2-2c-4gb": 24,
    "vc2-4c-8gb": 48,
  };
  return costs[size];
}

function costRiskLevel(cost: number | undefined): "low" | "medium" | "high" {
  if (cost === undefined || cost <= 25) return "low";
  if (cost <= 80) return "medium";
  return "high";
}

function stableHash(value: unknown): string {
  const input = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
