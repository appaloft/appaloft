import { describe, expect, test } from "bun:test";

import { ManagedWorkloadStateEligibility } from "../src";

const evaluatedAt = "2026-08-14T12:10:00.000Z";
const restorableProfile = {
  workloadRef: "resource:api",
  currentTargetId: "target_ewr",
  replacementTargetId: "target_sin",
  mode: "restorable" as const,
  objectives: {
    maximumRecoveryPointAgeSeconds: 300,
    maximumRecoveryTimeSeconds: 600,
  },
  evidence: {
    kind: "restore-rehearsal" as const,
    backupEvidenceRef: "backup:svb_20260814",
    restoreEvidenceRef: "restore:sra_20260814",
    sourceTargetId: "target_ewr",
    recoveryTargetId: "target_sin",
    observedAt: "2026-08-14T12:00:00.000Z",
    validUntil: "2026-08-14T13:00:00.000Z",
    observedRecoveryPointAgeSeconds: 120,
    observedRecoveryTimeSeconds: 240,
  },
};

describe("ManagedWorkloadStateEligibility", () => {
  test("[RESIL-STATE-007] admits explicit stateless and independently restored workloads", () => {
    const stateless = ManagedWorkloadStateEligibility.evaluate(
      {
        workloadRef: "resource:web",
        currentTargetId: "target_ewr",
        replacementTargetId: "target_sin",
        mode: "stateless",
      },
      evaluatedAt,
    )._unsafeUnwrap();
    expect(stateless.toJSON()).toMatchObject({
      status: "eligible",
      mode: "stateless",
      reasonCodes: ["state_stateless"],
    });

    const restored = ManagedWorkloadStateEligibility.evaluate(
      restorableProfile,
      evaluatedAt,
    )._unsafeUnwrap();
    expect(restored.toJSON()).toEqual({
      ...restorableProfile,
      status: "eligible",
      evaluatedAt,
      reasonCodes: ["state_restore_rehearsal_verified"],
    });
    expect(
      restored.isEligibleFor({
        workloadRef: "resource:api",
        currentTargetId: "target_ewr",
        replacementTargetId: "target_sin",
        at: "2026-08-14T12:59:59.999Z",
      }),
    ).toBe(true);
  });

  test("[RESIL-STATE-007] admits fresh external durability within objective", () => {
    const decision = ManagedWorkloadStateEligibility.evaluate(
      {
        workloadRef: "resource:api",
        currentTargetId: "target_ewr",
        replacementTargetId: "target_sin",
        mode: "external-durable",
        objectives: {
          maximumRecoveryPointAgeSeconds: 60,
          maximumRecoveryTimeSeconds: 120,
        },
        evidence: {
          kind: "external-durability",
          durabilityEvidenceRef: "durability:supabase:regional",
          sourceTargetId: "target_ewr",
          recoveryTargetId: "external:supabase",
          observedAt: "2026-08-14T12:00:00.000Z",
          validUntil: "2026-08-14T12:30:00.000Z",
          observedRecoveryPointAgeSeconds: 30,
          observedRecoveryTimeSeconds: 45,
        },
      },
      evaluatedAt,
    )._unsafeUnwrap();

    expect(decision.toJSON()).toMatchObject({
      status: "eligible",
      reasonCodes: ["state_external_durability_verified"],
    });
  });

  test("[RESIL-STATE-007] returns stable blockers for local, expired, shared, and over-SLO state", () => {
    const local = ManagedWorkloadStateEligibility.evaluate(
      {
        workloadRef: "resource:db",
        currentTargetId: "target_ewr",
        replacementTargetId: "target_sin",
        mode: "local-pvc",
      },
      evaluatedAt,
    )._unsafeUnwrap();
    expect(local.toJSON()).toMatchObject({
      status: "blocked",
      reasonCodes: ["state_local_pvc_not_portable"],
    });

    const blockedCases = [
      {
        profile: {
          ...restorableProfile,
          evidence: { ...restorableProfile.evidence, validUntil: evaluatedAt },
        },
        reason: "state_evidence_expired",
      },
      {
        profile: {
          ...restorableProfile,
          evidence: {
            ...restorableProfile.evidence,
            recoveryTargetId: restorableProfile.evidence.sourceTargetId,
          },
        },
        reason: "state_recovery_target_not_independent",
      },
      {
        profile: {
          ...restorableProfile,
          evidence: { ...restorableProfile.evidence, observedRecoveryPointAgeSeconds: 301 },
        },
        reason: "state_recovery_point_objective_exceeded",
      },
      {
        profile: {
          ...restorableProfile,
          evidence: { ...restorableProfile.evidence, observedRecoveryTimeSeconds: 601 },
        },
        reason: "state_recovery_time_objective_exceeded",
      },
    ];

    for (const blocked of blockedCases) {
      expect(
        ManagedWorkloadStateEligibility.evaluate(blocked.profile, evaluatedAt)
          ._unsafeUnwrap()
          .toJSON(),
      ).toMatchObject({ status: "blocked", reasonCodes: expect.arrayContaining([blocked.reason]) });
    }
  });

  test("[RESIL-STATE-007] distinguishes malformed values from valid blocked evidence", () => {
    expect(
      ManagedWorkloadStateEligibility.evaluate(
        {
          ...restorableProfile,
          objectives: {
            ...restorableProfile.objectives,
            maximumRecoveryTimeSeconds: -1,
          },
        },
        evaluatedAt,
      ).isErr(),
    ).toBe(true);

    const { evidence: _evidence, ...missingEvidenceProfile } = restorableProfile;
    expect(
      ManagedWorkloadStateEligibility.evaluate(missingEvidenceProfile, evaluatedAt)
        ._unsafeUnwrap()
        .toJSON(),
    ).toMatchObject({ status: "blocked", reasonCodes: ["state_evidence_missing"] });
  });
});
