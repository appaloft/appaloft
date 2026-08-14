export const managedClusterCapabilityKeys = [
  "infrastructure.cluster.provision",
  "infrastructure.cluster.inspect",
  "infrastructure.cluster.place",
  "infrastructure.cluster.failover",
  "infrastructure.cluster.recover",
  "infrastructure.cluster.delete",
  "infrastructure.cluster.cleanup-orphans",
] as const;

export type ManagedClusterCapabilityKey = (typeof managedClusterCapabilityKeys)[number];

export interface ManagedClusterForm {
  readonly clusterName: string;
  readonly clusterClass: string;
  readonly clusterRef: string;
  readonly workloadRef: string;
  readonly requiredCapabilities: string;
  readonly excludedTargetIds: string;
  readonly currentTargetId: string;
  readonly currentPlacementEpoch: string;
  readonly attempt: string;
}

export type ManagedClusterFormField = keyof ManagedClusterForm;

export type ManagedClusterParameterResult =
  | { readonly ok: true; readonly parameters: Record<string, unknown> }
  | { readonly ok: false; readonly field: ManagedClusterFormField };

export function isManagedClusterCapabilityKey(value: string): value is ManagedClusterCapabilityKey {
  return managedClusterCapabilityKeys.includes(value as ManagedClusterCapabilityKey);
}

export function buildManagedClusterParameters(
  capabilityKey: ManagedClusterCapabilityKey,
  form: ManagedClusterForm,
): ManagedClusterParameterResult {
  if (capabilityKey === "infrastructure.cluster.provision") {
    const clusterName = requiredText(form.clusterName);
    if (!clusterName) return { ok: false, field: "clusterName" };
    const clusterClass = requiredText(form.clusterClass);
    if (!clusterClass) return { ok: false, field: "clusterClass" };
    return {
      ok: true,
      parameters: {
        clusterName,
        clusterClass,
        requiredCapabilities: normalizedList(form.requiredCapabilities),
      },
    };
  }

  if (
    capabilityKey === "infrastructure.cluster.inspect" ||
    capabilityKey === "infrastructure.cluster.delete" ||
    capabilityKey === "infrastructure.cluster.cleanup-orphans"
  ) {
    const clusterRef = requiredText(form.clusterRef);
    return clusterRef
      ? { ok: true, parameters: { clusterRef } }
      : { ok: false, field: "clusterRef" };
  }

  const workloadRef = requiredText(form.workloadRef);
  if (!workloadRef) return { ok: false, field: "workloadRef" };
  const currentPlacementEpoch = nonnegativeInteger(form.currentPlacementEpoch);
  if (currentPlacementEpoch === undefined) {
    return { ok: false, field: "currentPlacementEpoch" };
  }
  const attempt = nonnegativeInteger(form.attempt);
  if (attempt === undefined) return { ok: false, field: "attempt" };
  const currentTargetId = requiredText(form.currentTargetId);
  if (
    (capabilityKey === "infrastructure.cluster.failover" ||
      capabilityKey === "infrastructure.cluster.recover") &&
    !currentTargetId
  ) {
    return { ok: false, field: "currentTargetId" };
  }
  const mode =
    capabilityKey === "infrastructure.cluster.failover"
      ? "failover"
      : capabilityKey === "infrastructure.cluster.recover"
        ? "recovery"
        : "initial";
  return {
    ok: true,
    parameters: {
      workloadRef,
      requiredCapabilities: normalizedList(form.requiredCapabilities),
      excludedTargetIds: normalizedList(form.excludedTargetIds),
      ...(currentTargetId ? { currentTargetId } : {}),
      currentPlacementEpoch,
      mode,
      attempt,
    },
  };
}

export function managedClusterFormFingerprint(
  capabilityKey: ManagedClusterCapabilityKey,
  form: ManagedClusterForm,
): string {
  return JSON.stringify([capabilityKey, form]);
}

function requiredText(value: string): string | undefined {
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizedList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].sort();
}

function nonnegativeInteger(value: string): number | undefined {
  if (!/^\d+$/.test(value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}
