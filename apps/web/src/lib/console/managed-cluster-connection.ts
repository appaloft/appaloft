export const managedClusterCapabilityKeys = [
  "infrastructure.cluster.provision",
  "infrastructure.cluster.import",
  "infrastructure.cluster.inspect",
  "infrastructure.cluster.readiness",
  "infrastructure.cluster.state-eligibility",
  "infrastructure.cluster.drain",
  "infrastructure.cluster.place",
  "infrastructure.cluster.failover",
  "infrastructure.cluster.recover",
  "infrastructure.cluster.delete",
  "infrastructure.cluster.cleanup-orphans",
  "infrastructure.cluster.handoff-traffic",
  "infrastructure.cluster.failback-traffic",
  "infrastructure.cluster.traffic-status",
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
  readonly routeRef: string;
  readonly currentEndpointRef: string;
  readonly replacementEndpointRef: string;
  readonly replacementTargetId: string;
  readonly currentFencingToken: string;
  readonly nextFencingToken: string;
  readonly healthProofRef: string;
  readonly healthObservedAt: string;
  readonly healthValidUntil: string;
  readonly plannedAt: string;
  readonly stateMode: string;
  readonly maximumRecoveryPointAgeSeconds: string;
  readonly maximumRecoveryTimeSeconds: string;
  readonly stateEvidenceKind: string;
  readonly durabilityEvidenceRef: string;
  readonly backupEvidenceRef: string;
  readonly restoreEvidenceRef: string;
  readonly stateEvidenceObservedAt: string;
  readonly stateEvidenceValidUntil: string;
  readonly observedRecoveryPointAgeSeconds: string;
  readonly observedRecoveryTimeSeconds: string;
  readonly stateSourceTargetId: string;
  readonly stateRecoveryTargetId: string;
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
  if (capabilityKey === "infrastructure.cluster.traffic-status") {
    const routeRef = requiredText(form.routeRef);
    return routeRef ? { ok: true, parameters: { routeRef } } : { ok: false, field: "routeRef" };
  }

  if (capabilityKey === "infrastructure.cluster.state-eligibility") {
    const workloadRef = requiredText(form.workloadRef);
    if (!workloadRef) return { ok: false, field: "workloadRef" };
    const currentTargetId = requiredText(form.currentTargetId);
    if (!currentTargetId) return { ok: false, field: "currentTargetId" };
    const replacementTargetId = requiredText(form.replacementTargetId);
    if (!replacementTargetId) return { ok: false, field: "replacementTargetId" };
    if (
      !(["stateless", "external-durable", "restorable", "local-pvc"] as const).includes(
        form.stateMode as "stateless",
      )
    ) {
      return { ok: false, field: "stateMode" };
    }
    const mode = form.stateMode as "stateless" | "external-durable" | "restorable" | "local-pvc";
    const maximumRecoveryPointAgeSeconds = optionalNonnegativeInteger(
      form.maximumRecoveryPointAgeSeconds,
    );
    if (maximumRecoveryPointAgeSeconds === null) {
      return { ok: false, field: "maximumRecoveryPointAgeSeconds" };
    }
    const maximumRecoveryTimeSeconds = optionalNonnegativeInteger(form.maximumRecoveryTimeSeconds);
    if (maximumRecoveryTimeSeconds === null) {
      return { ok: false, field: "maximumRecoveryTimeSeconds" };
    }
    const evidenceKind = requiredText(form.stateEvidenceKind);
    if (
      evidenceKind &&
      evidenceKind !== "external-durability" &&
      evidenceKind !== "restore-rehearsal"
    ) {
      return { ok: false, field: "stateEvidenceKind" };
    }
    const observedRecoveryPointAgeSeconds = optionalNonnegativeInteger(
      form.observedRecoveryPointAgeSeconds,
    );
    if (observedRecoveryPointAgeSeconds === null) {
      return { ok: false, field: "observedRecoveryPointAgeSeconds" };
    }
    const observedRecoveryTimeSeconds = optionalNonnegativeInteger(
      form.observedRecoveryTimeSeconds,
    );
    if (observedRecoveryTimeSeconds === null) {
      return { ok: false, field: "observedRecoveryTimeSeconds" };
    }
    const observedAt = requiredText(form.stateEvidenceObservedAt);
    if (observedAt && !isIsoInstant(observedAt)) {
      return { ok: false, field: "stateEvidenceObservedAt" };
    }
    const validUntil = requiredText(form.stateEvidenceValidUntil);
    if (validUntil && !isIsoInstant(validUntil)) {
      return { ok: false, field: "stateEvidenceValidUntil" };
    }
    const hasEvidence = Boolean(
      evidenceKind ||
        observedAt ||
        validUntil ||
        requiredText(form.durabilityEvidenceRef) ||
        requiredText(form.backupEvidenceRef) ||
        requiredText(form.restoreEvidenceRef),
    );
    return {
      ok: true,
      parameters: {
        stateProfile: {
          workloadRef,
          currentTargetId,
          replacementTargetId,
          mode,
          ...(maximumRecoveryPointAgeSeconds !== undefined &&
          maximumRecoveryTimeSeconds !== undefined
            ? {
                objectives: {
                  maximumRecoveryPointAgeSeconds,
                  maximumRecoveryTimeSeconds,
                },
              }
            : {}),
          ...(hasEvidence && evidenceKind && observedAt && validUntil
            ? {
                evidence: {
                  kind: evidenceKind,
                  ...(requiredText(form.durabilityEvidenceRef)
                    ? { durabilityEvidenceRef: requiredText(form.durabilityEvidenceRef) }
                    : {}),
                  ...(requiredText(form.backupEvidenceRef)
                    ? { backupEvidenceRef: requiredText(form.backupEvidenceRef) }
                    : {}),
                  ...(requiredText(form.restoreEvidenceRef)
                    ? { restoreEvidenceRef: requiredText(form.restoreEvidenceRef) }
                    : {}),
                  ...(requiredText(form.stateSourceTargetId)
                    ? { sourceTargetId: requiredText(form.stateSourceTargetId) }
                    : {}),
                  ...(requiredText(form.stateRecoveryTargetId)
                    ? { recoveryTargetId: requiredText(form.stateRecoveryTargetId) }
                    : {}),
                  observedAt,
                  validUntil,
                  ...(observedRecoveryPointAgeSeconds !== undefined
                    ? { observedRecoveryPointAgeSeconds }
                    : {}),
                  ...(observedRecoveryTimeSeconds !== undefined
                    ? { observedRecoveryTimeSeconds }
                    : {}),
                },
              }
            : {}),
        },
      },
    };
  }

  if (
    capabilityKey === "infrastructure.cluster.handoff-traffic" ||
    capabilityKey === "infrastructure.cluster.failback-traffic"
  ) {
    const requiredFields = [
      "routeRef",
      "workloadRef",
      "currentEndpointRef",
      "currentTargetId",
      "replacementEndpointRef",
      "replacementTargetId",
      "currentFencingToken",
      "nextFencingToken",
      "healthProofRef",
      "healthObservedAt",
      "healthValidUntil",
      "plannedAt",
    ] as const;
    const values = Object.fromEntries(
      requiredFields.map((field) => [field, requiredText(form[field])]),
    ) as Record<(typeof requiredFields)[number], string | undefined>;
    const missing = requiredFields.find((field) => !values[field]);
    if (missing) return { ok: false, field: missing };
    const currentPlacementEpoch = nonnegativeInteger(form.currentPlacementEpoch);
    if (currentPlacementEpoch === undefined) {
      return { ok: false, field: "currentPlacementEpoch" };
    }
    for (const field of ["healthObservedAt", "healthValidUntil", "plannedAt"] as const) {
      if (!isIsoInstant(values[field] as string)) return { ok: false, field };
    }
    const routeRef = values.routeRef as string;
    const workloadRef = values.workloadRef as string;
    const currentEndpointRef = values.currentEndpointRef as string;
    const currentTargetId = values.currentTargetId as string;
    const replacementEndpointRef = values.replacementEndpointRef as string;
    const replacementTargetId = values.replacementTargetId as string;
    return {
      ok: true,
      parameters: {
        action:
          capabilityKey === "infrastructure.cluster.failback-traffic" ? "failback" : "handoff",
        currentRoute: {
          routeRef,
          workloadRef,
          activeEndpointRef: currentEndpointRef,
          activeTargetId: currentTargetId,
          placementEpoch: currentPlacementEpoch,
          fencingToken: values.currentFencingToken as string,
        },
        currentEndpoint: {
          endpointRef: currentEndpointRef,
          workloadRef,
          targetId: currentTargetId,
        },
        replacementEndpoint: {
          endpointRef: replacementEndpointRef,
          workloadRef,
          targetId: replacementTargetId,
        },
        replacementHealth: {
          endpointRef: replacementEndpointRef,
          status: "healthy",
          observedAt: values.healthObservedAt as string,
          validUntil: values.healthValidUntil as string,
          proofRef: values.healthProofRef as string,
        },
        nextPlacementEpoch: currentPlacementEpoch + 1,
        nextFencingToken: values.nextFencingToken as string,
        rollbackEndpointRef: currentEndpointRef,
        plannedAt: values.plannedAt as string,
      },
    };
  }

  if (
    capabilityKey === "infrastructure.cluster.provision" ||
    capabilityKey === "infrastructure.cluster.import"
  ) {
    const clusterName = requiredText(form.clusterName);
    if (!clusterName) return { ok: false, field: "clusterName" };
    const clusterClass = requiredText(form.clusterClass);
    if (!clusterClass) return { ok: false, field: "clusterClass" };
    const clusterRef = requiredText(form.clusterRef);
    if (capabilityKey === "infrastructure.cluster.import" && !clusterRef) {
      return { ok: false, field: "clusterRef" };
    }
    return {
      ok: true,
      parameters: {
        ...(clusterRef && capabilityKey === "infrastructure.cluster.import" ? { clusterRef } : {}),
        clusterName,
        clusterClass,
        requiredCapabilities: normalizedList(form.requiredCapabilities),
      },
    };
  }

  if (
    capabilityKey === "infrastructure.cluster.inspect" ||
    capabilityKey === "infrastructure.cluster.drain" ||
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
  const currentTargetId = requiredText(form.currentTargetId);
  if (capabilityKey === "infrastructure.cluster.readiness") {
    if (!currentTargetId) return { ok: false, field: "currentTargetId" };
    return {
      ok: true,
      parameters: {
        workloadRef,
        requiredCapabilities: normalizedList(form.requiredCapabilities),
        excludedTargetIds: normalizedList(form.excludedTargetIds),
        currentTargetId,
        currentPlacementEpoch,
      },
    };
  }
  const attempt = nonnegativeInteger(form.attempt);
  if (attempt === undefined) return { ok: false, field: "attempt" };
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

function optionalNonnegativeInteger(value: string): number | undefined | null {
  if (!value.trim()) return undefined;
  return nonnegativeInteger(value) ?? null;
}

function isIsoInstant(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}
