import {
  type DeploymentDependencyBindingReferenceState,
  DeploymentDependencyBindingSnapshotReadinessValue,
  DescriptionText,
  err,
  ok,
  ResourceBindingId,
  ResourceBindingScopeValue,
  ResourceBindingTargetName,
  ResourceInjectionModeValue,
  ResourceInstanceId,
  ResourceInstanceKindValue,
  type Result,
} from "@appaloft/core";

import {
  type DeploymentDependencyBindingSnapshotReferenceSummary,
  type DeploymentDependencyBindingSnapshotSummary,
  type ResourceDependencyBindingSummary,
} from "../../ports";

const runtimeInjectionDeferredReason =
  "runtime dependency environment injection is deferred for this slice";

function toDependencyBindingReferenceKind(
  kind: ResourceInstanceKindValue,
): DeploymentDependencyBindingSnapshotReferenceSummary["kind"] {
  if (kind.value === "postgres" || kind.value === "redis") {
    return kind.value;
  }

  throw new Error(`Deployment dependency binding reference kind ${kind.value} is not supported`);
}

function snapshotReadiness(input: ResourceDependencyBindingSummary): {
  value: DeploymentDependencyBindingSnapshotReadinessValue;
  reason?: DescriptionText;
} {
  if (
    input.lifecycleStatus === "ready" &&
    input.bindingReadiness.status === "ready" &&
    input.snapshotReadiness.status === "ready"
  ) {
    return {
      value: DeploymentDependencyBindingSnapshotReadinessValue.ready(),
    };
  }

  return {
    value: DeploymentDependencyBindingSnapshotReadinessValue.blocked(),
    reason: DescriptionText.rehydrate(
      input.snapshotReadiness.reason ??
        input.bindingReadiness.reason ??
        `dependency binding ${input.id} is not ready for snapshot reference`,
    ),
  };
}

export function createDependencyBindingSnapshotReferences(
  bindings: ResourceDependencyBindingSummary[],
): Result<DeploymentDependencyBindingReferenceState[]> {
  const references: DeploymentDependencyBindingReferenceState[] = [];

  for (const binding of bindings) {
    if (binding.status !== "active") {
      continue;
    }

    const targetName = ResourceBindingTargetName.create(binding.target.targetName);
    if (targetName.isErr()) {
      return err(targetName.error);
    }
    const scope = ResourceBindingScopeValue.create(binding.target.scope);
    if (scope.isErr()) {
      return err(scope.error);
    }
    const injectionMode = ResourceInjectionModeValue.create(binding.target.injectionMode);
    if (injectionMode.isErr()) {
      return err(injectionMode.error);
    }

    const readiness = snapshotReadiness(binding);
    references.push({
      bindingId: ResourceBindingId.rehydrate(binding.id),
      dependencyResourceId: ResourceInstanceId.rehydrate(binding.dependencyResourceId),
      kind: ResourceInstanceKindValue.rehydrate(binding.kind),
      targetName: targetName.value,
      scope: scope.value,
      injectionMode: injectionMode.value,
      snapshotReadiness: readiness.value,
      ...(readiness.reason ? { snapshotReadinessReason: readiness.reason } : {}),
    });
  }

  return ok(references);
}

export function dependencyBindingReferenceSummary(
  reference: DeploymentDependencyBindingReferenceState,
): DeploymentDependencyBindingSnapshotReferenceSummary {
  return {
    bindingId: reference.bindingId.value,
    dependencyResourceId: reference.dependencyResourceId.value,
    kind: toDependencyBindingReferenceKind(reference.kind),
    targetName: reference.targetName.value,
    scope: reference.scope.value,
    injectionMode: reference.injectionMode.value,
    snapshotReadiness: {
      status: reference.snapshotReadiness.value,
      ...(reference.snapshotReadinessReason
        ? { reason: reference.snapshotReadinessReason.value }
        : {}),
    },
  };
}

export function dependencyBindingSnapshotSummaryFromReferences(
  references: DeploymentDependencyBindingReferenceState[],
): DeploymentDependencyBindingSnapshotSummary {
  return dependencyBindingSnapshotSummaryFromReferenceSummaries(
    references.map(dependencyBindingReferenceSummary),
  );
}

export function dependencyBindingSnapshotSummaryFromReferenceSummaries(
  summaries: DeploymentDependencyBindingSnapshotReferenceSummary[],
): DeploymentDependencyBindingSnapshotSummary {
  return {
    status:
      summaries.length === 0
        ? "not-applicable"
        : summaries.some((reference) => reference.snapshotReadiness.status === "blocked")
          ? "blocked"
          : "ready",
    references: summaries,
    runtimeInjection: {
      status: "deferred",
      reason: runtimeInjectionDeferredReason,
    },
  };
}
