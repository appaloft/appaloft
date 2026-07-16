import {
  deploymentProofConfigurationFingerprint,
  deploymentProofEnvironmentKeyFingerprint,
  type DeploymentProofRuntimeEvidence,
  type DeploymentProofRuntimeEvidenceReader,
  type DeploymentSummary,
  type ExecutionContext,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";

export interface DockerInspectState {
  Id?: string;
  Image?: string;
  Created?: string;
  State?: { Running?: boolean; StartedAt?: string; Health?: { Status?: string } };
  Config?: { Image?: string; Labels?: Record<string, string>; Env?: string[] };
  Spec?: {
    Labels?: Record<string, string>;
    TaskTemplate?: { ContainerSpec?: { Image?: string; Env?: string[] } };
  };
  UpdatedAt?: string;
}

async function run(args: string[]): Promise<{ ok: boolean; stdout: string }> {
  try {
    const process = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
    const [stdout, exitCode] = await Promise.all([new Response(process.stdout).text(), process.exited]);
    return { ok: exitCode === 0, stdout: stdout.trim() };
  } catch {
    return { ok: false, stdout: "" };
  }
}

function unavailable(deployment: DeploymentSummary, reasonCode: string): DeploymentProofRuntimeEvidence {
  const observedAt = new Date().toISOString();
  return {
    available: false,
    observedAt,
    reasonCode,
    artifact: { available: false, reasonCode: "artifact_identity_unavailable" },
    workload: { available: false, reasonCode: "runtime_readback_unavailable" },
    configuration: { available: false, reasonCode: "configuration_evidence_unavailable" },
    health: { status: "unavailable", summary: "Current runtime health is unavailable", reasonCode: "internal_health_unavailable" },
    access: { status: "unavailable", summary: "Current access route evidence is unavailable", reasonCode: "public_access_unavailable" },
    recovery: {
      ...(deployment.runtimePlan.execution.metadata?.previousDeploymentId
        ? { rollbackCandidateDeploymentId: deployment.runtimePlan.execution.metadata.previousDeploymentId }
        : {}),
      reasonCode: "recovery_evidence_unavailable",
    },
  };
}

export function deploymentProofEvidenceFromDockerInspect(
  deployment: DeploymentSummary,
  inspect: DockerInspectState,
): DeploymentProofRuntimeEvidence {
  const labels = inspect.Config?.Labels ?? inspect.Spec?.Labels ?? {};
  const observedDeploymentId = labels["appaloft.deployment-id"];
  const configurationFingerprint = labels["appaloft.configuration-fingerprint"];
  const plannedFingerprint = deploymentProofConfigurationFingerprint(deployment.environmentSnapshot.variables);
  const plannedKeys = [
    ...new Set([
      ...deployment.environmentSnapshot.variables
        .filter((variable) => variable.exposure === "runtime")
        .map((variable) => variable.key),
      ...(deployment.dependencyBindingReferences ?? [])
        .filter(
          (reference) =>
            reference.scope === "runtime-only" &&
            reference.injectionMode === "env" &&
            reference.snapshotReadiness.status === "ready",
        )
        .map((reference) => reference.targetName),
    ]),
  ].sort();
  const observedEnvironmentEntries =
    inspect.Config?.Env ?? inspect.Spec?.TaskTemplate?.ContainerSpec?.Env;
  const observedKeys = observedEnvironmentEntries
    ? [
        ...new Set(
          observedEnvironmentEntries.map((entry) => {
            const separator = entry.indexOf("=");
            return separator < 0 ? entry : entry.slice(0, separator);
          }),
        ),
      ].filter((key) => key.length > 0)
    : undefined;
  const matchesPlannedKeySet = observedKeys
    ? plannedKeys.every((key) => observedKeys.includes(key))
    : false;
  const observedPlannedKeys = observedKeys
    ? plannedKeys.filter((key) => observedKeys.includes(key))
    : undefined;
  const running = inspect.State?.Running ?? true;
  const healthStatus = inspect.State?.Health?.Status;
  const healthPassed = running && healthStatus !== "unhealthy";
  const routeTargetsWorkload = observedDeploymentId === deployment.id;
  const imageReference = inspect.Config?.Image ?? inspect.Spec?.TaskTemplate?.ContainerSpec?.Image;
  return {
    available: true,
    observedAt: new Date().toISOString(),
    artifact: {
      available: Boolean(inspect.Image || imageReference),
      ...(imageReference ? { reference: imageReference } : {}),
      ...(inspect.Image ? { resolvedIdentity: inspect.Image } : imageReference ? { resolvedIdentity: imageReference } : {}),
      ...(!inspect.Image && !imageReference ? { reasonCode: "artifact_identity_unavailable" } : {}),
    },
    workload: {
      available: Boolean(inspect.Id),
      ...(inspect.Id ? { identity: inspect.Id } : {}),
      ...(observedDeploymentId ? { generation: observedDeploymentId, deploymentId: observedDeploymentId } : {}),
      ...(inspect.State?.StartedAt ?? inspect.UpdatedAt ?? inspect.Created
        ? { startedAt: inspect.State?.StartedAt ?? inspect.UpdatedAt ?? inspect.Created }
        : {}),
      ...(!inspect.Id ? { reasonCode: "workload_identity_unavailable" } : {}),
    },
    configuration: {
      available: Boolean(configurationFingerprint && observedKeys),
      ...(configurationFingerprint
        ? {
            fingerprint: configurationFingerprint,
            matchesPlanned:
              configurationFingerprint === plannedFingerprint && matchesPlannedKeySet,
          }
        : {}),
      ...(observedPlannedKeys
        ? {
            keyCount: observedPlannedKeys.length,
            plannedKeyCount: plannedKeys.length,
            keyFingerprint: deploymentProofEnvironmentKeyFingerprint(observedPlannedKeys),
            matchesPlannedKeySet,
          }
        : {}),
      ...(!configurationFingerprint || !observedKeys
        ? { reasonCode: "configuration_environment_key_evidence_unavailable" }
        : {}),
    },
    health: { status: healthPassed ? "passed" : "failed", summary: healthPassed ? "Observed workload is running and healthy" : "Observed workload is not healthy" },
    access: { status: routeTargetsWorkload ? "passed" : "failed", routeTargetsWorkload, summary: routeTargetsWorkload ? "Observed route ownership points to this workload generation" : "Observed workload generation does not match the planned route owner" },
    recovery: {
      previousRuntimeRetained: Boolean(deployment.runtimePlan.execution.metadata?.previousDeploymentId),
      ...(deployment.runtimePlan.execution.metadata?.previousDeploymentId ? { rollbackCandidateDeploymentId: deployment.runtimePlan.execution.metadata.previousDeploymentId } : {}),
    },
  };
}

export class RuntimeDeploymentProofEvidenceReader implements DeploymentProofRuntimeEvidenceReader {
  async read(_context: ExecutionContext, deployment: DeploymentSummary): Promise<Result<DeploymentProofRuntimeEvidence>> {
    const provider = deployment.runtimePlan.target.providerKey;
    if (provider === "generic-ssh") return ok(unavailable(deployment, "generic_ssh_runtime_readback_unavailable"));

    if (provider === "docker-swarm") {
      const serviceId = await run(["docker", "service", "ls", "-q", "--filter", `label=appaloft.resource-id=${deployment.resourceId}`]);
      if (!serviceId.ok || !serviceId.stdout.split(/\s+/u)[0]) return ok(unavailable(deployment, "docker_swarm_service_unavailable"));
      const inspect = await run(["docker", "service", "inspect", serviceId.stdout.split(/\s+/u)[0]!, "--format", "{{json .}}"]);
      if (!inspect.ok) return ok(unavailable(deployment, "docker_swarm_inspect_unavailable"));
      try { return ok(deploymentProofEvidenceFromDockerInspect(deployment, JSON.parse(inspect.stdout) as DockerInspectState)); } catch { return ok(unavailable(deployment, "docker_swarm_inspect_invalid")); }
    }

    if (provider !== "local-shell") return ok(unavailable(deployment, "runtime_target_readback_unsupported"));
    const containerId = await run(["docker", "ps", "-aq", "--filter", `label=appaloft.resource-id=${deployment.resourceId}`]);
    const firstContainerId = containerId.stdout.split(/\s+/u)[0];
    if (!containerId.ok || !firstContainerId) return ok(unavailable(deployment, "docker_container_unavailable"));
    const inspect = await run(["docker", "inspect", firstContainerId, "--format", "{{json .}}"]);
    if (!inspect.ok) return ok(unavailable(deployment, "docker_inspect_unavailable"));
    try { return ok(deploymentProofEvidenceFromDockerInspect(deployment, JSON.parse(inspect.stdout) as DockerInspectState)); } catch { return ok(unavailable(deployment, "docker_inspect_invalid")); }
  }
}
