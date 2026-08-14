import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";

export type ManagedWorkloadStateMode =
  | "stateless"
  | "external-durable"
  | "restorable"
  | "local-pvc";

export type ManagedWorkloadStateEvidenceKind = "external-durability" | "restore-rehearsal";

export type ManagedWorkloadStateEligibilityStatus = "eligible" | "blocked";

export interface ManagedWorkloadRecoveryObjectivesSnapshot {
  maximumRecoveryPointAgeSeconds: number;
  maximumRecoveryTimeSeconds: number;
}

export interface ManagedWorkloadStateEvidenceSnapshot {
  kind: ManagedWorkloadStateEvidenceKind;
  durabilityEvidenceRef?: string;
  backupEvidenceRef?: string;
  restoreEvidenceRef?: string;
  sourceTargetId?: string;
  recoveryTargetId?: string;
  observedAt: string;
  validUntil: string;
  observedRecoveryPointAgeSeconds?: number;
  observedRecoveryTimeSeconds?: number;
}

export interface ManagedWorkloadStateProfileSnapshot {
  workloadRef: string;
  currentTargetId: string;
  replacementTargetId: string;
  mode: ManagedWorkloadStateMode;
  objectives?: ManagedWorkloadRecoveryObjectivesSnapshot;
  evidence?: ManagedWorkloadStateEvidenceSnapshot;
}

export interface ManagedWorkloadStateEligibilitySnapshot
  extends ManagedWorkloadStateProfileSnapshot {
  status: ManagedWorkloadStateEligibilityStatus;
  evaluatedAt: string;
  reasonCodes: string[];
}

function requiredText(value: string, label: string): Result<string> {
  const normalized = value.trim();
  return normalized ? ok(normalized) : err(domainError.validation(`${label} is required`));
}

function optionalEvidenceRef(value: string | undefined, label: string): Result<string | undefined> {
  if (value === undefined) return ok(undefined);
  const normalized = value.trim();
  if (!normalized) return err(domainError.validation(`${label} is required when provided`));
  if (/\s/.test(normalized)) {
    return err(domainError.validation(`${label} must be a safe single-token reference`));
  }
  return ok(normalized);
}

function instant(value: string, label: string): Result<string> {
  const normalized = value.trim();
  return normalized && Number.isFinite(Date.parse(normalized))
    ? ok(new Date(normalized).toISOString())
    : err(domainError.validation(`${label} must be an ISO instant`));
}

function optionalNonnegativeSeconds(
  value: number | undefined,
  label: string,
): Result<number | undefined> {
  if (value === undefined) return ok(undefined);
  return Number.isSafeInteger(value) && value >= 0
    ? ok(value)
    : err(domainError.validation(`${label} must be a non-negative integer`));
}

function objectives(
  input: ManagedWorkloadRecoveryObjectivesSnapshot | undefined,
): Result<ManagedWorkloadRecoveryObjectivesSnapshot | undefined> {
  if (!input) return ok(undefined);
  const rpo = optionalNonnegativeSeconds(
    input.maximumRecoveryPointAgeSeconds,
    "Maximum recovery point age",
  );
  if (rpo.isErr() || rpo.value === undefined) {
    return err(rpo.isErr() ? rpo.error : domainError.validation("Maximum RPO is required"));
  }
  const rto = optionalNonnegativeSeconds(input.maximumRecoveryTimeSeconds, "Maximum recovery time");
  if (rto.isErr() || rto.value === undefined) {
    return err(rto.isErr() ? rto.error : domainError.validation("Maximum RTO is required"));
  }
  return ok({
    maximumRecoveryPointAgeSeconds: rpo.value,
    maximumRecoveryTimeSeconds: rto.value,
  });
}

function evidence(
  input: ManagedWorkloadStateEvidenceSnapshot | undefined,
): Result<ManagedWorkloadStateEvidenceSnapshot | undefined> {
  if (!input) return ok(undefined);
  if (!(input.kind === "external-durability" || input.kind === "restore-rehearsal")) {
    return err(domainError.validation(`Unsupported state evidence kind ${input.kind}`));
  }
  const observedAt = instant(input.observedAt, "State evidence observedAt");
  if (observedAt.isErr()) return err(observedAt.error);
  const validUntil = instant(input.validUntil, "State evidence validUntil");
  if (validUntil.isErr()) return err(validUntil.error);
  if (Date.parse(validUntil.value) <= Date.parse(observedAt.value)) {
    return err(domainError.validation("State evidence validity must end after observation"));
  }
  const durabilityEvidenceRef = optionalEvidenceRef(
    input.durabilityEvidenceRef,
    "Durability evidence ref",
  );
  if (durabilityEvidenceRef.isErr()) return err(durabilityEvidenceRef.error);
  const backupEvidenceRef = optionalEvidenceRef(input.backupEvidenceRef, "Backup evidence ref");
  if (backupEvidenceRef.isErr()) return err(backupEvidenceRef.error);
  const restoreEvidenceRef = optionalEvidenceRef(input.restoreEvidenceRef, "Restore evidence ref");
  if (restoreEvidenceRef.isErr()) return err(restoreEvidenceRef.error);
  const sourceTargetId = input.sourceTargetId
    ? requiredText(input.sourceTargetId, "State evidence source target id")
    : ok(undefined);
  if (sourceTargetId.isErr()) return err(sourceTargetId.error);
  const recoveryTargetId = input.recoveryTargetId
    ? requiredText(input.recoveryTargetId, "State evidence recovery target id")
    : ok(undefined);
  if (recoveryTargetId.isErr()) return err(recoveryTargetId.error);
  const observedRpo = optionalNonnegativeSeconds(
    input.observedRecoveryPointAgeSeconds,
    "Observed recovery point age",
  );
  if (observedRpo.isErr()) return err(observedRpo.error);
  const observedRto = optionalNonnegativeSeconds(
    input.observedRecoveryTimeSeconds,
    "Observed recovery time",
  );
  if (observedRto.isErr()) return err(observedRto.error);

  return ok({
    kind: input.kind,
    ...(durabilityEvidenceRef.value ? { durabilityEvidenceRef: durabilityEvidenceRef.value } : {}),
    ...(backupEvidenceRef.value ? { backupEvidenceRef: backupEvidenceRef.value } : {}),
    ...(restoreEvidenceRef.value ? { restoreEvidenceRef: restoreEvidenceRef.value } : {}),
    ...(sourceTargetId.value ? { sourceTargetId: sourceTargetId.value } : {}),
    ...(recoveryTargetId.value ? { recoveryTargetId: recoveryTargetId.value } : {}),
    observedAt: observedAt.value,
    validUntil: validUntil.value,
    ...(observedRpo.value !== undefined
      ? { observedRecoveryPointAgeSeconds: observedRpo.value }
      : {}),
    ...(observedRto.value !== undefined ? { observedRecoveryTimeSeconds: observedRto.value } : {}),
  });
}

function validMode(value: string): value is ManagedWorkloadStateMode {
  return ["stateless", "external-durable", "restorable", "local-pvc"].includes(value);
}

function reasonCodesFor(
  profile: ManagedWorkloadStateProfileSnapshot,
  evaluatedAt: string,
): string[] {
  if (profile.mode === "stateless") return ["state_stateless"];
  if (profile.mode === "local-pvc") return ["state_local_pvc_not_portable"];

  const reasons: string[] = [];
  if (!profile.objectives) reasons.push("state_objectives_missing");
  if (!profile.evidence) return [...reasons, "state_evidence_missing"];

  const expectedKind =
    profile.mode === "external-durable" ? "external-durability" : "restore-rehearsal";
  if (profile.evidence.kind !== expectedKind) reasons.push("state_evidence_kind_mismatch");
  if (Date.parse(evaluatedAt) < Date.parse(profile.evidence.observedAt)) {
    reasons.push("state_evidence_not_yet_observed");
  }
  if (Date.parse(evaluatedAt) >= Date.parse(profile.evidence.validUntil)) {
    reasons.push("state_evidence_expired");
  }
  if (!profile.evidence.sourceTargetId || !profile.evidence.recoveryTargetId) {
    reasons.push("state_recovery_targets_missing");
  } else if (profile.evidence.sourceTargetId === profile.evidence.recoveryTargetId) {
    reasons.push("state_recovery_target_not_independent");
  }
  if (
    profile.evidence.sourceTargetId &&
    profile.evidence.sourceTargetId !== profile.currentTargetId
  ) {
    reasons.push("state_source_target_mismatch");
  }
  if (
    profile.mode === "restorable" &&
    profile.evidence.recoveryTargetId &&
    profile.evidence.recoveryTargetId !== profile.replacementTargetId
  ) {
    reasons.push("state_recovery_target_mismatch");
  }
  if (profile.mode === "external-durable" && !profile.evidence.durabilityEvidenceRef) {
    reasons.push("state_durability_evidence_missing");
  }
  if (profile.mode === "restorable" && !profile.evidence.backupEvidenceRef) {
    reasons.push("state_backup_evidence_missing");
  }
  if (profile.mode === "restorable" && !profile.evidence.restoreEvidenceRef) {
    reasons.push("state_restore_evidence_missing");
  }
  if (profile.evidence.observedRecoveryPointAgeSeconds === undefined) {
    reasons.push("state_recovery_point_observation_missing");
  }
  if (profile.evidence.observedRecoveryTimeSeconds === undefined) {
    reasons.push("state_recovery_time_observation_missing");
  }
  if (
    profile.objectives &&
    profile.evidence.observedRecoveryPointAgeSeconds !== undefined &&
    profile.evidence.observedRecoveryPointAgeSeconds >
      profile.objectives.maximumRecoveryPointAgeSeconds
  ) {
    reasons.push("state_recovery_point_objective_exceeded");
  }
  if (
    profile.objectives &&
    profile.evidence.observedRecoveryTimeSeconds !== undefined &&
    profile.evidence.observedRecoveryTimeSeconds > profile.objectives.maximumRecoveryTimeSeconds
  ) {
    reasons.push("state_recovery_time_objective_exceeded");
  }
  return reasons.length > 0
    ? reasons
    : [
        profile.mode === "external-durable"
          ? "state_external_durability_verified"
          : "state_restore_rehearsal_verified",
      ];
}

function cloneEvidence(
  input: ManagedWorkloadStateEvidenceSnapshot,
): ManagedWorkloadStateEvidenceSnapshot {
  return { ...input };
}

export class ManagedWorkloadStateEligibility {
  private constructor(private readonly snapshot: ManagedWorkloadStateEligibilitySnapshot) {}

  static evaluate(
    input: ManagedWorkloadStateProfileSnapshot,
    evaluatedAtInput: string,
  ): Result<ManagedWorkloadStateEligibility> {
    const workloadRef = requiredText(input.workloadRef, "State workload ref");
    if (workloadRef.isErr()) return err(workloadRef.error);
    const currentTargetId = requiredText(input.currentTargetId, "State current target id");
    if (currentTargetId.isErr()) return err(currentTargetId.error);
    const replacementTargetId = requiredText(
      input.replacementTargetId,
      "State replacement target id",
    );
    if (replacementTargetId.isErr()) return err(replacementTargetId.error);
    if (currentTargetId.value === replacementTargetId.value) {
      return err(domainError.conflict("State replacement target must differ from current target"));
    }
    if (!validMode(input.mode)) {
      return err(domainError.validation(`Unsupported workload state mode ${input.mode}`));
    }
    const parsedObjectives = objectives(input.objectives);
    if (parsedObjectives.isErr()) return err(parsedObjectives.error);
    const parsedEvidence = evidence(input.evidence);
    if (parsedEvidence.isErr()) return err(parsedEvidence.error);
    const evaluatedAt = instant(evaluatedAtInput, "State eligibility evaluatedAt");
    if (evaluatedAt.isErr()) return err(evaluatedAt.error);
    const profile: ManagedWorkloadStateProfileSnapshot = {
      workloadRef: workloadRef.value,
      currentTargetId: currentTargetId.value,
      replacementTargetId: replacementTargetId.value,
      mode: input.mode,
      ...(parsedObjectives.value ? { objectives: parsedObjectives.value } : {}),
      ...(parsedEvidence.value ? { evidence: parsedEvidence.value } : {}),
    };
    const reasonCodes = reasonCodesFor(profile, evaluatedAt.value);
    const status =
      reasonCodes.length === 1 &&
      [
        "state_stateless",
        "state_external_durability_verified",
        "state_restore_rehearsal_verified",
      ].includes(reasonCodes[0] ?? "")
        ? "eligible"
        : "blocked";
    return ok(
      new ManagedWorkloadStateEligibility({
        ...profile,
        status,
        evaluatedAt: evaluatedAt.value,
        reasonCodes,
      }),
    );
  }

  static create(
    input: ManagedWorkloadStateEligibilitySnapshot,
  ): Result<ManagedWorkloadStateEligibility> {
    const evaluated = ManagedWorkloadStateEligibility.evaluate(input, input.evaluatedAt);
    if (evaluated.isErr()) return err(evaluated.error);
    const canonical = evaluated.value.toJSON();
    if (
      canonical.status !== input.status ||
      JSON.stringify(canonical.reasonCodes) !== JSON.stringify(input.reasonCodes)
    ) {
      return err(domainError.conflict("State eligibility decision does not match its evidence"));
    }
    return evaluated;
  }

  isEligibleFor(input: {
    workloadRef: string;
    currentTargetId: string;
    replacementTargetId: string;
    at: string;
  }): boolean {
    if (
      this.snapshot.status !== "eligible" ||
      this.snapshot.workloadRef !== input.workloadRef ||
      this.snapshot.currentTargetId !== input.currentTargetId ||
      this.snapshot.replacementTargetId !== input.replacementTargetId
    ) {
      return false;
    }
    if (!this.snapshot.evidence) return this.snapshot.mode === "stateless";
    const at = Date.parse(input.at);
    return (
      Number.isFinite(at) &&
      at >= Date.parse(this.snapshot.evidence.observedAt) &&
      at < Date.parse(this.snapshot.evidence.validUntil)
    );
  }

  toJSON(): ManagedWorkloadStateEligibilitySnapshot {
    return {
      ...this.snapshot,
      ...(this.snapshot.objectives ? { objectives: { ...this.snapshot.objectives } } : {}),
      ...(this.snapshot.evidence ? { evidence: cloneEvidence(this.snapshot.evidence) } : {}),
      reasonCodes: [...this.snapshot.reasonCodes],
    };
  }
}
