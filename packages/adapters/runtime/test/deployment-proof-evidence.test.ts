import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import { deploymentProofConfigurationFingerprint, type DeploymentSummary } from "@appaloft/application";
import { deploymentProofEvidenceFromDockerInspect, RuntimeDeploymentProofEvidenceReader } from "../src";

const variables = [
  { key: "APP_VERSION", value: "v2", kind: "plain-config", exposure: "runtime", scope: "environment", isSecret: false },
  { key: "TOKEN", value: "do-not-return", kind: "secret", exposure: "runtime", scope: "environment", isSecret: true },
] as DeploymentSummary["environmentSnapshot"]["variables"];

const deployment = {
  id: "dep_v2",
  runtimePlan: { execution: { metadata: { previousDeploymentId: "dep_v1" } } },
  environmentSnapshot: { variables },
} as DeploymentSummary;

describe("deployment proof runtime evidence", () => {
  test("[DEP-PROOF-ADAPTER-001] normalizes Docker identity without leaking inspect environment", () => {
    const configurationFingerprint = deploymentProofConfigurationFingerprint(variables);
    const evidence = deploymentProofEvidenceFromDockerInspect(deployment, {
      Id: "container-v2",
      Image: "sha256:image-v2",
      State: { Running: true, StartedAt: "2026-07-12T09:59:11.000Z", Health: { Status: "healthy" } },
      Config: {
        Image: "appaloft/web:v2",
        Labels: {
          "appaloft.deployment-id": "dep_v2",
          "appaloft.configuration-fingerprint": configurationFingerprint,
        },
      },
    });

    expect(evidence).toMatchObject({
      available: true,
      artifact: { resolvedIdentity: "sha256:image-v2" },
      workload: { identity: "container-v2", generation: "dep_v2" },
      configuration: { fingerprint: configurationFingerprint, matchesPlanned: true },
      health: { status: "passed" },
      access: { status: "passed", routeTargetsWorkload: true },
      recovery: { previousRuntimeRetained: true, rollbackCandidateDeploymentId: "dep_v1" },
    });
    expect(JSON.stringify(evidence)).not.toContain("do-not-return");
  });

  test("[DEP-PROOF-ADAPTER-002] reports stale workload and configuration instead of trusting health", () => {
    const evidence = deploymentProofEvidenceFromDockerInspect(deployment, {
      Id: "container-v1",
      Image: "sha256:image-v1",
      State: { Running: true, Health: { Status: "healthy" } },
      Config: {
        Labels: {
          "appaloft.deployment-id": "dep_v1",
          "appaloft.configuration-fingerprint": "sha256:old-config",
        },
      },
    });

    expect(evidence.health.status).toBe("passed");
    expect(evidence.workload.generation).toBe("dep_v1");
    expect(evidence.configuration.matchesPlanned).toBe(false);
    expect(evidence.access.routeTargetsWorkload).toBe(false);
  });

  test("[DEP-PROOF-ADAPTER-002] generic SSH reports a truthful readback gap", async () => {
    const reader = new RuntimeDeploymentProofEvidenceReader();
    const result = await reader.read({} as never, {
      ...deployment,
      runtimePlan: {
        ...deployment.runtimePlan,
        target: { kind: "single-server", providerKey: "generic-ssh", serverIds: ["srv_demo"] },
      },
    } as DeploymentSummary);

    expect(result._unsafeUnwrap()).toMatchObject({
      available: false,
      reasonCode: "generic_ssh_runtime_readback_unavailable",
      workload: { available: false },
    });
  });

  test("[DEP-PROOF-ADAPTER-002] unsupported static publisher reports an explicit gap", async () => {
    const reader = new RuntimeDeploymentProofEvidenceReader();
    const result = await reader.read({} as never, {
      ...deployment,
      runtimePlan: {
        ...deployment.runtimePlan,
        execution: { kind: "static-publication" },
        target: { kind: "static-publisher", providerKey: "external-static", serverIds: [] },
      },
    } as unknown as DeploymentSummary);

    expect(result._unsafeUnwrap()).toMatchObject({
      available: false,
      reasonCode: "runtime_target_readback_unsupported",
      artifact: { available: false },
    });
  });
});
