import { describe, expect, test } from "bun:test";
import { deploymentProofResponseSchema } from "../src";

describe("deployment proof contract", () => {
  test("[DEP-PROOF-CONTRACT-001] parses the shared deployments.proof/v1 shape", () => {
    const parsed = deploymentProofResponseSchema.parse({
      schemaVersion: "deployments.proof/v1",
      deploymentId: "dep_v2",
      resourceId: "res_web",
      verdict: "verified",
      planned: {
        source: { reference: "acme/web", revision: "2222" },
        artifact: { intent: "build-image", reference: "appaloft/web:v2" },
        resourceProfile: { fingerprint: "sha256:profile" },
        configuration: { fingerprint: "sha256:config" },
        runtimeTarget: { kind: "single-server", providerKey: "local-shell" },
        verificationSteps: [{ kind: "internal-http", label: "health" }],
        expectedEffects: ["replace-workload"],
      },
      observed: {
        available: true,
        observedAt: "2026-07-12T10:00:00.000Z",
        artifact: { available: true, resolvedIdentity: "sha256:image" },
        workload: {
          available: true,
          identity: "container",
          generation: "dep_v2",
          deploymentId: "dep_v2",
        },
        configuration: {
          available: true,
          keyCount: 2,
          plannedKeyCount: 2,
          keyFingerprint: "sha256:keys",
          matchesPlanned: true,
          matchesPlannedKeySet: true,
        },
        health: { status: "passed", summary: "ok" },
        access: { status: "passed", summary: "ok", routeTargetsWorkload: true },
        recovery: { previousRuntimeRetained: true },
      },
      mismatches: [],
      evidence: [],
      unavailableEvidence: [],
      generatedAt: "2026-07-12T10:00:00.000Z",
      stateVersion: "v1",
    });
    expect(parsed.verdict).toBe("verified");
    expect(parsed.observed.configuration).toMatchObject({
      keyCount: 2,
      plannedKeyCount: 2,
      keyFingerprint: "sha256:keys",
      matchesPlannedKeySet: true,
    });
  });
});
