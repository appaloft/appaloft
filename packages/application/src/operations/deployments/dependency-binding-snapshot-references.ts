import {
  type DeploymentDependencyBindingReferenceState,
  DeploymentDependencyBindingSnapshotReadinessValue,
  DeploymentDependencyRuntimeSecretRef,
  DescriptionText,
  domainError,
  type EnvironmentSnapshot,
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

import { type ExecutionContext } from "../../execution-context";
import {
  type DependencyResourceSecretStore,
  type DeploymentDependencyBindingSnapshotReferenceSummary,
  type DeploymentDependencyBindingSnapshotSummary,
  type ResourceDependencyBindingSummary,
  type RuntimeTargetBackend,
} from "../../ports";

export const dependencyRuntimeSecretDeliveryCapability = "runtime.dependency-secrets" as const;
const appaloftOwnedDependencySecretRefPrefixes = [
  "appaloft://dependency-resources/",
  "appaloft+pg://resource-binding/",
];

function toDependencyBindingReferenceKind(
  kind: ResourceInstanceKindValue,
): DeploymentDependencyBindingSnapshotReferenceSummary["kind"] {
  if (kind.value === "postgres" || kind.value === "redis") {
    return kind.value;
  }

  throw new Error(`Deployment dependency binding reference kind ${kind.value} is not supported`);
}

function runtimeInjectionBlockReason(
  binding: ResourceDependencyBindingSummary,
): string | undefined {
  if (binding.kind !== "postgres" && binding.kind !== "redis") {
    return "dependency_runtime_injection_kind_unsupported";
  }

  if (binding.target.scope !== "runtime-only") {
    return "dependency_runtime_injection_scope_unsupported";
  }

  if (binding.target.injectionMode !== "env") {
    return "dependency_runtime_injection_mode_unsupported";
  }

  if (!binding.target.secretRef && !binding.connection?.secretRef) {
    return "dependency_runtime_injection_secret_ref_missing";
  }

  return undefined;
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
    const runtimeBlockReason = runtimeInjectionBlockReason(input);
    if (runtimeBlockReason) {
      return {
        value: DeploymentDependencyBindingSnapshotReadinessValue.blocked(),
        reason: DescriptionText.rehydrate(runtimeBlockReason),
      };
    }

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
    const runtimeSecretRefValue = binding.target.secretRef ?? binding.connection?.secretRef;
    const runtimeSecretRef = runtimeSecretRefValue
      ? DeploymentDependencyRuntimeSecretRef.create(runtimeSecretRefValue)
      : undefined;
    if (runtimeSecretRef?.isErr()) {
      return err(runtimeSecretRef.error);
    }

    const readiness = snapshotReadiness(binding);
    references.push({
      bindingId: ResourceBindingId.rehydrate(binding.id),
      dependencyResourceId: ResourceInstanceId.rehydrate(binding.dependencyResourceId),
      kind: ResourceInstanceKindValue.rehydrate(binding.kind),
      targetName: targetName.value,
      scope: scope.value,
      injectionMode: injectionMode.value,
      ...(runtimeSecretRef?.isOk() ? { runtimeSecretRef: runtimeSecretRef.value } : {}),
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
  input: { runtimeInjectionReason?: string } = {},
): DeploymentDependencyBindingSnapshotSummary {
  return dependencyBindingSnapshotSummaryFromReferenceSummaries(
    references.map(dependencyBindingReferenceSummary),
    input,
  );
}

function duplicateRuntimeTargetName(
  summaries: DeploymentDependencyBindingSnapshotReferenceSummary[],
) {
  const seen = new Set<string>();
  for (const summary of summaries) {
    if (seen.has(summary.targetName)) {
      return summary.targetName;
    }
    seen.add(summary.targetName);
  }

  return undefined;
}

export function dependencyBindingSnapshotSummaryFromReferenceSummaries(
  summaries: DeploymentDependencyBindingSnapshotReferenceSummary[],
  input: { runtimeInjectionReason?: string } = {},
): DeploymentDependencyBindingSnapshotSummary {
  const blockedReason =
    input.runtimeInjectionReason ??
    summaries.find((reference) => reference.snapshotReadiness.status === "blocked")
      ?.snapshotReadiness.reason ??
    (duplicateRuntimeTargetName(summaries)
      ? "dependency_runtime_injection_duplicate_target"
      : undefined);
  const status = summaries.length === 0 ? "not-applicable" : blockedReason ? "blocked" : "ready";

  return {
    status,
    references: summaries,
    runtimeInjection: {
      status,
      ...(blockedReason ? { reason: blockedReason } : {}),
    },
  };
}

export function dependencyRuntimeInjectionBlockedError(
  summary: DeploymentDependencyBindingSnapshotSummary,
) {
  return domainError.dependencyRuntimeInjectionBlocked(
    "Dependency runtime injection is blocked for this deployment",
    {
      reason: summary.runtimeInjection.reason ?? "dependency_runtime_injection_blocked",
      bindingCount: summary.references.length,
    },
  );
}

export function dependencyRuntimeInjectionBackendReason(
  backend: RuntimeTargetBackend,
): string | undefined {
  return backend.descriptor.capabilities.includes(dependencyRuntimeSecretDeliveryCapability)
    ? undefined
    : "dependency_runtime_injection_target_backend_unsupported";
}

export async function dependencyRuntimeSecretResolutionReason(input: {
  context: ExecutionContext;
  dependencyResourceSecretStore: DependencyResourceSecretStore;
  references: DeploymentDependencyBindingReferenceState[];
}): Promise<string | undefined> {
  for (const reference of input.references) {
    if (reference.snapshotReadiness.value !== "ready") {
      continue;
    }
    const secretRef = reference.runtimeSecretRef?.value;
    if (
      !secretRef ||
      !appaloftOwnedDependencySecretRefPrefixes.some((prefix) => secretRef.startsWith(prefix))
    ) {
      continue;
    }
    const resolved = await input.dependencyResourceSecretStore.resolve(input.context, {
      secretRef,
    });
    if (resolved.isErr()) {
      return "dependency_runtime_secret_unresolved";
    }
  }

  return undefined;
}

export function dependencyRuntimeInjectionEnvironmentConflictReason(input: {
  environmentSnapshot: EnvironmentSnapshot;
  references: DeploymentDependencyBindingReferenceState[];
}): string | undefined {
  const runtimeVariables = new Set(
    input.environmentSnapshot
      .toState()
      .variables.filter((variable) => variable.exposure.value === "runtime")
      .map((variable) => variable.key.value),
  );

  return input.references.some((reference) => runtimeVariables.has(reference.targetName.value))
    ? "dependency_runtime_injection_target_conflict"
    : undefined;
}
