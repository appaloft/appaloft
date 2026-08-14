import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";

export type ManagedTrafficHandoffAction = "handoff" | "failback";
export type ManagedTrafficHealthStatus = "healthy" | "unhealthy";
export type ManagedTrafficHandoffOutcome =
  | "moved"
  | "preserved"
  | "rolled-back"
  | "manual-intervention";

export interface ManagedTrafficEndpointSnapshot {
  endpointRef: string;
  workloadRef: string;
  targetId: string;
}

export interface ManagedTrafficRouteSnapshot {
  routeRef: string;
  workloadRef: string;
  activeEndpointRef: string;
  activeTargetId: string;
  placementEpoch: number;
  fencingToken: string;
}

export interface ManagedTrafficHealthEvidenceSnapshot {
  endpointRef: string;
  status: ManagedTrafficHealthStatus;
  observedAt: string;
  validUntil: string;
  proofRef: string;
}

export interface ManagedTrafficHandoffPlanSnapshot {
  action: ManagedTrafficHandoffAction;
  currentRoute: ManagedTrafficRouteSnapshot;
  currentEndpoint: ManagedTrafficEndpointSnapshot;
  replacementEndpoint: ManagedTrafficEndpointSnapshot;
  replacementHealth: ManagedTrafficHealthEvidenceSnapshot;
  nextPlacementEpoch: number;
  nextFencingToken: string;
  rollbackEndpointRef: string;
  plannedAt: string;
}

export interface ManagedTrafficHandoffReceiptSnapshot {
  operationId: string;
  action: ManagedTrafficHandoffAction;
  outcome: ManagedTrafficHandoffOutcome;
  previousRoute: ManagedTrafficRouteSnapshot;
  finalRoute?: ManagedTrafficRouteSnapshot;
  healthEvidence: ManagedTrafficHealthEvidenceSnapshot;
  executionSteps: string[];
  rollbackAttempts: number;
  cleanup: {
    residualOwnedResources: number;
    transientResourceRefs: string[];
  };
}

function requiredText(value: string | undefined, label: string): Result<string> {
  const normalized = value?.trim();
  return normalized ? ok(normalized) : err(domainError.validation(`${label} is required`));
}

function instant(value: string, label: string): Result<string> {
  const normalized = requiredText(value, label);
  if (normalized.isErr()) return err(normalized.error);
  return Number.isNaN(Date.parse(normalized.value))
    ? err(domainError.validation(`${label} must be an ISO timestamp`))
    : ok(normalized.value);
}

function nonNegativeInteger(value: number, label: string): Result<number> {
  return Number.isInteger(value) && value >= 0
    ? ok(value)
    : err(domainError.validation(`${label} must be a non-negative integer`));
}

function createEndpoint(
  input: ManagedTrafficEndpointSnapshot,
): Result<ManagedTrafficEndpointSnapshot> {
  const endpointRef = requiredText(input.endpointRef, "Managed traffic endpoint ref");
  if (endpointRef.isErr()) return err(endpointRef.error);
  const workloadRef = requiredText(input.workloadRef, "Managed traffic endpoint workload ref");
  if (workloadRef.isErr()) return err(workloadRef.error);
  const targetId = requiredText(input.targetId, "Managed traffic endpoint target id");
  if (targetId.isErr()) return err(targetId.error);
  return ok({
    endpointRef: endpointRef.value,
    workloadRef: workloadRef.value,
    targetId: targetId.value,
  });
}

export class ManagedTrafficRoute {
  private constructor(private readonly snapshot: ManagedTrafficRouteSnapshot) {}

  static create(input: ManagedTrafficRouteSnapshot): Result<ManagedTrafficRoute> {
    const routeRef = requiredText(input.routeRef, "Managed traffic route ref");
    if (routeRef.isErr()) return err(routeRef.error);
    const workloadRef = requiredText(input.workloadRef, "Managed traffic route workload ref");
    if (workloadRef.isErr()) return err(workloadRef.error);
    const activeEndpointRef = requiredText(
      input.activeEndpointRef,
      "Managed traffic active endpoint ref",
    );
    if (activeEndpointRef.isErr()) return err(activeEndpointRef.error);
    const activeTargetId = requiredText(input.activeTargetId, "Managed traffic active target id");
    if (activeTargetId.isErr()) return err(activeTargetId.error);
    const placementEpoch = nonNegativeInteger(
      input.placementEpoch,
      "Managed traffic placement epoch",
    );
    if (placementEpoch.isErr()) return err(placementEpoch.error);
    const fencingToken = requiredText(input.fencingToken, "Managed traffic fencing token");
    if (fencingToken.isErr()) return err(fencingToken.error);
    return ok(
      new ManagedTrafficRoute({
        routeRef: routeRef.value,
        workloadRef: workloadRef.value,
        activeEndpointRef: activeEndpointRef.value,
        activeTargetId: activeTargetId.value,
        placementEpoch: placementEpoch.value,
        fencingToken: fencingToken.value,
      }),
    );
  }

  equals(other: ManagedTrafficRouteSnapshot): boolean {
    return JSON.stringify(this.snapshot) === JSON.stringify(other);
  }

  toJSON(): ManagedTrafficRouteSnapshot {
    return { ...this.snapshot };
  }
}

export class ManagedTrafficHealthEvidence {
  private constructor(private readonly snapshot: ManagedTrafficHealthEvidenceSnapshot) {}

  static create(input: ManagedTrafficHealthEvidenceSnapshot): Result<ManagedTrafficHealthEvidence> {
    const endpointRef = requiredText(input.endpointRef, "Managed traffic health endpoint ref");
    if (endpointRef.isErr()) return err(endpointRef.error);
    if (!(["healthy", "unhealthy"] as const).includes(input.status)) {
      return err(
        domainError.validation(`Unsupported managed traffic health status ${input.status}`),
      );
    }
    const observedAt = instant(input.observedAt, "Managed traffic health observed at");
    if (observedAt.isErr()) return err(observedAt.error);
    const validUntil = instant(input.validUntil, "Managed traffic health valid until");
    if (validUntil.isErr()) return err(validUntil.error);
    if (Date.parse(observedAt.value) >= Date.parse(validUntil.value)) {
      return err(domainError.validation("Managed traffic health evidence validity is empty"));
    }
    const proofRef = requiredText(input.proofRef, "Managed traffic health proof ref");
    if (proofRef.isErr()) return err(proofRef.error);
    return ok(
      new ManagedTrafficHealthEvidence({
        endpointRef: endpointRef.value,
        status: input.status,
        observedAt: observedAt.value,
        validUntil: validUntil.value,
        proofRef: proofRef.value,
      }),
    );
  }

  isHealthy(): boolean {
    return this.snapshot.status === "healthy";
  }

  isFreshAt(at: string): boolean {
    const timestamp = Date.parse(at);
    return (
      Number.isFinite(timestamp) &&
      timestamp >= Date.parse(this.snapshot.observedAt) &&
      timestamp < Date.parse(this.snapshot.validUntil)
    );
  }

  toJSON(): ManagedTrafficHealthEvidenceSnapshot {
    return { ...this.snapshot };
  }
}

export class ManagedTrafficHandoffPlan {
  private constructor(private readonly snapshot: ManagedTrafficHandoffPlanSnapshot) {}

  static create(input: ManagedTrafficHandoffPlanSnapshot): Result<ManagedTrafficHandoffPlan> {
    if (!(["handoff", "failback"] as const).includes(input.action)) {
      return err(domainError.validation(`Unsupported managed traffic action ${input.action}`));
    }
    const currentRoute = ManagedTrafficRoute.create(input.currentRoute);
    if (currentRoute.isErr()) return err(currentRoute.error);
    const currentEndpoint = createEndpoint(input.currentEndpoint);
    if (currentEndpoint.isErr()) return err(currentEndpoint.error);
    const replacementEndpoint = createEndpoint(input.replacementEndpoint);
    if (replacementEndpoint.isErr()) return err(replacementEndpoint.error);
    const replacementHealth = ManagedTrafficHealthEvidence.create(input.replacementHealth);
    if (replacementHealth.isErr()) return err(replacementHealth.error);
    const plannedAt = instant(input.plannedAt, "Managed traffic handoff planned at");
    if (plannedAt.isErr()) return err(plannedAt.error);
    const nextPlacementEpoch = nonNegativeInteger(
      input.nextPlacementEpoch,
      "Managed traffic next placement epoch",
    );
    if (nextPlacementEpoch.isErr()) return err(nextPlacementEpoch.error);
    const nextFencingToken = requiredText(
      input.nextFencingToken,
      "Managed traffic next fencing token",
    );
    if (nextFencingToken.isErr()) return err(nextFencingToken.error);
    const rollbackEndpointRef = requiredText(
      input.rollbackEndpointRef,
      "Managed traffic rollback endpoint ref",
    );
    if (rollbackEndpointRef.isErr()) return err(rollbackEndpointRef.error);
    const route = currentRoute.value.toJSON();
    if (
      currentEndpoint.value.endpointRef !== route.activeEndpointRef ||
      currentEndpoint.value.targetId !== route.activeTargetId ||
      currentEndpoint.value.workloadRef !== route.workloadRef
    ) {
      return err(domainError.conflict("Managed traffic current endpoint does not own the route"));
    }
    if (
      replacementEndpoint.value.workloadRef !== route.workloadRef ||
      replacementEndpoint.value.endpointRef === currentEndpoint.value.endpointRef ||
      replacementEndpoint.value.targetId === currentEndpoint.value.targetId
    ) {
      return err(domainError.conflict("Managed traffic replacement endpoint is not independent"));
    }
    if (replacementHealth.value.toJSON().endpointRef !== replacementEndpoint.value.endpointRef) {
      return err(
        domainError.conflict("Managed traffic health evidence does not match replacement"),
      );
    }
    if (
      !replacementHealth.value.isHealthy() ||
      !replacementHealth.value.isFreshAt(plannedAt.value)
    ) {
      return err(
        domainError.conflict("Managed traffic replacement endpoint is not freshly healthy"),
      );
    }
    if (nextPlacementEpoch.value !== route.placementEpoch + 1) {
      return err(domainError.conflict("Managed traffic placement epoch must advance exactly once"));
    }
    if (nextFencingToken.value === route.fencingToken) {
      return err(domainError.conflict("Managed traffic fencing token must rotate"));
    }
    if (rollbackEndpointRef.value !== currentEndpoint.value.endpointRef) {
      return err(
        domainError.conflict("Managed traffic rollback endpoint must be the current endpoint"),
      );
    }
    return ok(
      new ManagedTrafficHandoffPlan({
        action: input.action,
        currentRoute: route,
        currentEndpoint: currentEndpoint.value,
        replacementEndpoint: replacementEndpoint.value,
        replacementHealth: replacementHealth.value.toJSON(),
        nextPlacementEpoch: nextPlacementEpoch.value,
        nextFencingToken: nextFencingToken.value,
        rollbackEndpointRef: rollbackEndpointRef.value,
        plannedAt: plannedAt.value,
      }),
    );
  }

  healthIsFreshAt(at: string): boolean {
    return ManagedTrafficHealthEvidence.create(this.snapshot.replacementHealth)
      ._unsafeUnwrap()
      .isFreshAt(at);
  }

  matchesLiveRoute(route: ManagedTrafficRouteSnapshot): boolean {
    return ManagedTrafficRoute.create(this.snapshot.currentRoute)._unsafeUnwrap().equals(route);
  }

  movedRoute(): ManagedTrafficRouteSnapshot {
    return {
      ...this.snapshot.currentRoute,
      activeEndpointRef: this.snapshot.replacementEndpoint.endpointRef,
      activeTargetId: this.snapshot.replacementEndpoint.targetId,
      placementEpoch: this.snapshot.nextPlacementEpoch,
      fencingToken: this.snapshot.nextFencingToken,
    };
  }

  toJSON(): ManagedTrafficHandoffPlanSnapshot {
    return {
      ...this.snapshot,
      currentRoute: { ...this.snapshot.currentRoute },
      currentEndpoint: { ...this.snapshot.currentEndpoint },
      replacementEndpoint: { ...this.snapshot.replacementEndpoint },
      replacementHealth: { ...this.snapshot.replacementHealth },
    };
  }
}

export class ManagedTrafficHandoffReceipt {
  private constructor(private readonly snapshot: ManagedTrafficHandoffReceiptSnapshot) {}

  static create(input: ManagedTrafficHandoffReceiptSnapshot): Result<ManagedTrafficHandoffReceipt> {
    const operationId = requiredText(input.operationId, "Managed traffic operation id");
    if (operationId.isErr()) return err(operationId.error);
    if (!(["handoff", "failback"] as const).includes(input.action)) {
      return err(domainError.validation(`Unsupported managed traffic action ${input.action}`));
    }
    if (
      !(["moved", "preserved", "rolled-back", "manual-intervention"] as const).includes(
        input.outcome,
      )
    ) {
      return err(domainError.validation(`Unsupported managed traffic outcome ${input.outcome}`));
    }
    const previousRoute = ManagedTrafficRoute.create(input.previousRoute);
    if (previousRoute.isErr()) return err(previousRoute.error);
    const finalRoute = input.finalRoute ? ManagedTrafficRoute.create(input.finalRoute) : undefined;
    if (finalRoute?.isErr()) return err(finalRoute.error);
    const healthEvidence = ManagedTrafficHealthEvidence.create(input.healthEvidence);
    if (healthEvidence.isErr()) return err(healthEvidence.error);
    const rollbackAttempts = nonNegativeInteger(
      input.rollbackAttempts,
      "Managed traffic rollback attempts",
    );
    if (rollbackAttempts.isErr()) return err(rollbackAttempts.error);
    const steps = input.executionSteps.map((step) => step.trim());
    if (steps.some((step) => !step)) {
      return err(domainError.validation("Managed traffic execution steps must not be empty"));
    }
    const residualOwnedResources = nonNegativeInteger(
      input.cleanup.residualOwnedResources,
      "Managed traffic residual owned resources",
    );
    if (residualOwnedResources.isErr()) return err(residualOwnedResources.error);
    const transientResourceRefs = input.cleanup.transientResourceRefs.map((ref) => ref.trim());
    if (
      transientResourceRefs.some((ref) => !ref) ||
      new Set(transientResourceRefs).size !== transientResourceRefs.length
    ) {
      return err(
        domainError.validation("Managed traffic transient refs must be unique non-empty values"),
      );
    }
    const previous = previousRoute.value.toJSON();
    const final = finalRoute?.isOk() ? finalRoute.value.toJSON() : undefined;
    if (input.outcome === "moved") {
      if (
        !final ||
        final.routeRef !== previous.routeRef ||
        final.workloadRef !== previous.workloadRef ||
        final.activeEndpointRef === previous.activeEndpointRef ||
        final.activeTargetId === previous.activeTargetId ||
        final.placementEpoch !== previous.placementEpoch + 1 ||
        final.fencingToken === previous.fencingToken ||
        rollbackAttempts.value !== 0 ||
        !steps.includes("authority-verified")
      ) {
        return err(domainError.conflict("Managed traffic moved outcome is not verified"));
      }
    }
    if (input.outcome === "preserved") {
      if (!final || !previousRoute.value.equals(final) || rollbackAttempts.value !== 0) {
        return err(
          domainError.conflict("Managed traffic preserved outcome changed route authority"),
        );
      }
    }
    if (input.outcome === "rolled-back") {
      if (
        !final ||
        !previousRoute.value.equals(final) ||
        rollbackAttempts.value !== 1 ||
        !steps.includes("rollback-verified")
      ) {
        return err(domainError.conflict("Managed traffic rollback outcome is not verified"));
      }
    }
    if (input.outcome === "manual-intervention" && rollbackAttempts.value !== 1) {
      return err(
        domainError.conflict("Managed traffic manual intervention requires one rollback attempt"),
      );
    }
    return ok(
      new ManagedTrafficHandoffReceipt({
        operationId: operationId.value,
        action: input.action,
        outcome: input.outcome,
        previousRoute: previous,
        ...(final ? { finalRoute: final } : {}),
        healthEvidence: healthEvidence.value.toJSON(),
        executionSteps: steps,
        rollbackAttempts: rollbackAttempts.value,
        cleanup: {
          residualOwnedResources: residualOwnedResources.value,
          transientResourceRefs,
        },
      }),
    );
  }

  toJSON(): ManagedTrafficHandoffReceiptSnapshot {
    return {
      ...this.snapshot,
      previousRoute: { ...this.snapshot.previousRoute },
      ...(this.snapshot.finalRoute ? { finalRoute: { ...this.snapshot.finalRoute } } : {}),
      healthEvidence: { ...this.snapshot.healthEvidence },
      executionSteps: [...this.snapshot.executionSteps],
      cleanup: {
        residualOwnedResources: this.snapshot.cleanup.residualOwnedResources,
        transientResourceRefs: [...this.snapshot.cleanup.transientResourceRefs],
      },
    };
  }
}
