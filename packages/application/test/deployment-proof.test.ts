import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { DeploymentByIdSpec, ok, type Result } from "@appaloft/core";

import { createExecutionContext, type ExecutionContext, type toRepositoryContext } from "../src";
import { DeploymentProofQuery } from "../src/messages";
import {
  type DeploymentProof,
  type DeploymentProofRuntimeEvidence,
  type DeploymentProofRuntimeEvidenceReader,
  type DeploymentReadModel,
  type DeploymentSummary,
} from "../src/ports";
import { DeploymentProofQueryService } from "../src/use-cases";

class FixedClock {
  now(): string {
    return "2026-07-12T10:00:00.000Z";
  }
}

class StaticDeploymentReadModel implements DeploymentReadModel {
  constructor(private readonly deployments: DeploymentSummary[]) {}

  async count(): Promise<number> {
    return this.deployments.length;
  }

  async list(): Promise<DeploymentSummary[]> {
    return this.deployments;
  }

  async findOne(
    _context: ReturnType<typeof toRepositoryContext>,
    spec: Parameters<DeploymentReadModel["findOne"]>[1],
  ): Promise<DeploymentSummary | null> {
    return spec instanceof DeploymentByIdSpec
      ? (this.deployments.find((item) => item.id === spec.id.value) ?? null)
      : null;
  }

  async findTimeline(): Promise<DeploymentSummary["timeline"]> {
    return this.deployments[0]?.timeline ?? [];
  }
}

class StaticRuntimeEvidenceReader implements DeploymentProofRuntimeEvidenceReader {
  constructor(private readonly evidence: DeploymentProofRuntimeEvidence) {}

  async read(): Promise<Result<DeploymentProofRuntimeEvidence>> {
    return ok(this.evidence);
  }
}

function context(): ExecutionContext {
  return createExecutionContext({ requestId: "req_deployment_proof", entrypoint: "system" });
}

function deployment(overrides: Partial<DeploymentSummary> = {}): DeploymentSummary {
  return {
    id: "dep_v2",
    projectId: "prj_demo",
    environmentId: "env_demo",
    resourceId: "res_web",
    status: "succeeded",
    triggerKind: "redeploy",
    sourceCommitSha: "2222222222222222222222222222222222222222",
    runtimePlan: {
      id: "rplan_v2",
      source: {
        kind: "git-public",
        locator: "https://github.com/acme/web.git",
        displayName: "acme/web",
      },
      buildStrategy: "workspace-commands",
      packagingMode: "all-in-one-docker",
      runtimeArtifact: { kind: "image", intent: "build-image", image: "appaloft/web:v2" },
      execution: {
        kind: "docker-container",
        image: "appaloft/web:v2",
        healthCheckPath: "/health",
        verificationSteps: [
          { kind: "internal-http", label: "Internal health" },
          { kind: "public-http", label: "Public access" },
        ],
        metadata: { previousDeploymentId: "dep_v1" },
      },
      target: { kind: "single-server", providerKey: "local-shell", serverIds: ["srv_demo"] },
      detectSummary: "workspace",
      generatedAt: "2026-07-12T09:59:00.000Z",
      steps: ["detect", "plan", "package", "deploy", "verify"],
    },
    environmentSnapshot: {
      id: "snap_v2",
      environmentId: "env_demo",
      createdAt: "2026-07-12T09:59:00.000Z",
      precedence: ["environment"],
      variables: [
        {
          key: "APP_VERSION",
          value: "v2",
          kind: "plain-config",
          exposure: "runtime",
          scope: "environment",
          isSecret: false,
        },
        {
          key: "DATABASE_PASSWORD",
          value: "never-return-this-secret",
          kind: "secret",
          exposure: "runtime",
          scope: "environment",
          isSecret: true,
        },
      ],
    },
    timeline: [],
    timelineCount: 3,
    createdAt: "2026-07-12T09:59:00.000Z",
    startedAt: "2026-07-12T09:59:10.000Z",
    finishedAt: "2026-07-12T09:59:30.000Z",
    ...overrides,
    serverId: overrides.serverId ?? "srv_demo",
    destinationId: overrides.destinationId ?? "dst_demo",
    target: {
      kind: "server-backed",
      serverId: overrides.serverId ?? "srv_demo",
      destinationId: overrides.destinationId ?? "dst_demo",
    },
  };
}

function evidence(
  overrides: Partial<DeploymentProofRuntimeEvidence> = {},
): DeploymentProofRuntimeEvidence {
  return {
    available: true,
    observedAt: "2026-07-12T09:59:31.000Z",
    artifact: {
      available: true,
      reference: "appaloft/web:v2",
      resolvedIdentity: "sha256:image-v2",
    },
    workload: {
      available: true,
      identity: "container-v2",
      generation: "dep_v2",
      deploymentId: "dep_v2",
      startedAt: "2026-07-12T09:59:11.000Z",
    },
    configuration: { available: true, matchesPlanned: true },
    health: { status: "passed", summary: "internal health passed" },
    access: { status: "passed", routeTargetsWorkload: true, summary: "public route passed" },
    recovery: { previousRuntimeRetained: true, rollbackCandidateDeploymentId: "dep_v1" },
    ...overrides,
  };
}

function service(input: {
  deployment?: DeploymentSummary | null;
  evidence?: DeploymentProofRuntimeEvidence;
}) {
  return new DeploymentProofQueryService(
    new StaticDeploymentReadModel(
      input.deployment === null ? [] : [input.deployment ?? deployment()],
    ),
    new StaticRuntimeEvidenceReader(input.evidence ?? evidence()),
    new FixedClock(),
  );
}

function query(input: { deploymentId?: string; resourceId?: string } = {}) {
  return DeploymentProofQuery.create({
    deploymentId: input.deploymentId ?? "dep_v2",
    ...input,
  })._unsafeUnwrap();
}

function unwrap(result: Result<DeploymentProof>): DeploymentProof {
  expect(result.isOk()).toBe(true);
  return result._unsafeUnwrap();
}

describe("DeploymentProofQueryService", () => {
  test("[DEP-PROOF-VERDICT-001] complete matching evidence is verified", async () => {
    const proof = unwrap(await service({}).execute(context(), query()));

    expect(proof.schemaVersion).toBe("deployments.proof/v1");
    expect(proof.verdict).toBe("verified");
    expect(proof.planned.source.revision).toBe("2222222222222222222222222222222222222222");
    expect(proof.observed.workload.generation).toBe("dep_v2");
    expect(proof.mismatches).toEqual([]);
  });

  test("[DEP-PROOF-VERDICT-002] health 200 with unchanged workload generation is never verified", async () => {
    const proof = unwrap(
      await service({
        evidence: evidence({
          workload: {
            available: true,
            identity: "container-v1",
            generation: "dep_v1",
            deploymentId: "dep_v1",
            startedAt: "2026-07-12T08:00:00.000Z",
          },
        }),
      }).execute(context(), query()),
    );

    expect(proof.observed.health.status).toBe("passed");
    expect(proof.verdict).not.toBe("verified");
    expect(proof.mismatches.map((item) => item.reasonCode)).toContain(
      "workload_generation_mismatch",
    );
  });

  test("[DEP-PROOF-VERDICT-003] missing artifact identity is partially verified", async () => {
    const proof = unwrap(
      await service({
        evidence: evidence({
          artifact: { available: false, reasonCode: "artifact_identity_unavailable" },
        }),
      }).execute(context(), query()),
    );

    expect(proof.verdict).toBe("partially-verified");
    expect(proof.unavailableEvidence.map((item) => item.reasonCode)).toContain(
      "artifact_identity_unavailable",
    );
  });

  test("[DEP-PROOF-VERDICT-004] external workload replacement makes proof stale", async () => {
    const proof = unwrap(
      await service({
        evidence: evidence({
          workload: {
            available: true,
            identity: "external-container",
            generation: "external-generation",
            deploymentId: "dep_external",
            startedAt: "2026-07-12T10:00:01.000Z",
          },
        }),
      }).execute(context(), query()),
    );

    expect(proof.verdict).toBe("stale");
    expect(proof.mismatches[0]?.recommendedOperations).toContain("deployments.force-redeploy");
  });

  test("[DEP-PROOF-VERDICT-005] failed health and route mismatch fail proof", async () => {
    const proof = unwrap(
      await service({
        evidence: evidence({
          health: { status: "failed", summary: "health returned 503" },
          access: {
            status: "passed",
            routeTargetsWorkload: false,
            summary: "old route is healthy",
          },
        }),
      }).execute(context(), query()),
    );

    expect(proof.verdict).toBe("failed");
    expect(proof.mismatches.map((item) => item.reasonCode)).toEqual(
      expect.arrayContaining(["internal_health_failed", "access_route_workload_mismatch"]),
    );
  });

  test("[DEP-PROOF-EFFECT-001] replacement plan requires workload and artifact effects", async () => {
    const proof = unwrap(await service({}).execute(context(), query()));

    expect(proof.planned.expectedEffects).toEqual(
      expect.arrayContaining(["rebuild-artifact", "replace-workload", "verify-health-policy"]),
    );
  });

  test("[DEP-PROOF-VERDICT-006] resolved artifact mismatch fails proof", async () => {
    const proof = unwrap(
      await service({
        evidence: evidence({
          artifact: {
            available: true,
            reference: "appaloft/web:v1",
            resolvedIdentity: "sha256:image-v1",
          },
        }),
      }).execute(context(), query()),
    );

    expect(proof.verdict).toBe("failed");
    expect(proof.mismatches.map((item) => item.reasonCode)).toContain("artifact_identity_mismatch");
  });

  test("[DEP-PROOF-VERDICT-007] compose manifest and target container image are not compared as the same identity", async () => {
    const base = deployment();
    const proof = unwrap(
      await service({
        deployment: deployment({
          runtimePlan: {
            ...base.runtimePlan,
            runtimeArtifact: {
              kind: "compose-project",
              intent: "compose-project",
              composeFile: "docker-compose.production.yml",
            },
            execution: {
              kind: "docker-compose-stack",
              composeFile: "docker-compose.production.yml",
              healthCheckPath: "/login",
              verificationSteps: [
                { kind: "internal-http", label: "Internal health" },
                { kind: "public-http", label: "Public access" },
              ],
              metadata: { targetServiceName: "web" },
            },
            target: {
              kind: "single-server",
              providerKey: "generic-ssh",
              serverIds: ["srv_demo"],
            },
          },
        }),
        evidence: evidence({
          artifact: {
            available: true,
            reference: "stocktruth-platform:production",
            resolvedIdentity: "sha256:stocktruth-platform-v2",
          },
        }),
      }).execute(context(), query()),
    );

    expect(proof.verdict).toBe("verified");
    expect(proof.planned.artifact.reference).toBe("docker-compose.production.yml");
    expect(proof.observed.artifact.reference).toBe("stocktruth-platform:production");
    expect(proof.mismatches).toEqual([]);
  });

  test("[DEP-PROOF-SAFE-001] secret values never appear in proof JSON", async () => {
    const proof = unwrap(await service({}).execute(context(), query()));
    const serialized = JSON.stringify(proof);

    expect(proof.planned.configuration.fingerprint).toMatch(/^sha256:/);
    expect(serialized).not.toContain("never-return-this-secret");
    expect(serialized).not.toContain("DATABASE_PASSWORD");
  });

  test("[DEP-PROOF-SCOPE-001] resource context mismatch fails closed", async () => {
    const result = await service({}).execute(context(), query({ resourceId: "res_other" }));

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("resource_context_mismatch");
  });

  test("[DEP-PROOF-SCOPE-001] missing deployment fails closed", async () => {
    const result = await service({ deployment: null }).execute(
      context(),
      query({ deploymentId: "dep_missing" }),
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("not_found");
  });

  test("[DEP-PROOF-RECOVERY-001] unavailable recovery evidence remains explicit", async () => {
    const proof = unwrap(
      await service({
        evidence: evidence({
          recovery: { reasonCode: "recovery_evidence_unavailable" },
        }),
      }).execute(context(), query()),
    );

    expect(proof.observed.recovery).toEqual({ reasonCode: "recovery_evidence_unavailable" });
  });
});
