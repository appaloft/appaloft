import {
  DeploymentByIdSpec,
  DeploymentId,
  domainError,
  err,
  ok,
  type Result,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type DeploymentProof,
  type DeploymentProofEvidenceReference,
  type DeploymentProofManagedRoute,
  type DeploymentProofMismatch,
  type DeploymentProofReasonCode,
  type DeploymentProofRuntimeEvidence,
  type DeploymentProofRuntimeEvidenceReader,
  type DeploymentProofUnavailableEvidence,
  type DeploymentProofVerdict,
  type DeploymentReadModel,
  type DeploymentSummary,
  type DomainBindingReadModel,
} from "../../ports";
import { tokens } from "../../tokens";
import { type DeploymentProofQuery } from "./deployment-proof.query";
import {
  deploymentProofConfigurationFingerprint,
  deploymentProofFingerprint,
} from "./deployment-proof-fingerprint";

const deploymentProofDomainBindingReadLimit = 1_001;

function configurationFingerprint(deployment: DeploymentSummary): string {
  return deploymentProofConfigurationFingerprint(deployment.environmentSnapshot.variables);
}
function resourceProfileFingerprint(deployment: DeploymentSummary): string {
  return deploymentProofFingerprint({
    source: deployment.runtimePlan.source,
    buildStrategy: deployment.runtimePlan.buildStrategy,
    packagingMode: deployment.runtimePlan.packagingMode,
    execution: deployment.runtimePlan.execution,
    target: deployment.runtimePlan.target,
  });
}
function artifactReference(deployment: DeploymentSummary): string | undefined {
  return (
    deployment.runtimePlan.runtimeArtifact?.image ??
    deployment.runtimePlan.runtimeArtifact?.composeFile ??
    deployment.runtimePlan.execution.image ??
    deployment.runtimePlan.execution.composeFile
  );
}
function comparableArtifactReference(deployment: DeploymentSummary): string | undefined {
  if (
    deployment.runtimePlan.runtimeArtifact?.kind === "compose-project" ||
    deployment.runtimePlan.execution.kind === "docker-compose-stack"
  ) {
    return deployment.runtimePlan.runtimeArtifact?.image ?? deployment.runtimePlan.execution.image;
  }
  return artifactReference(deployment);
}
function artifactDigest(reference: string | undefined): string | undefined {
  return reference?.match(/(?:@|^)(sha256:[a-f0-9]+)$/iu)?.[1]?.toLowerCase();
}
function expectedEffects(
  deployment: DeploymentSummary,
): DeploymentProof["planned"]["expectedEffects"] {
  const effects: DeploymentProof["planned"]["expectedEffects"] = [];
  if (deployment.runtimePlan.runtimeArtifact?.intent === "build-image")
    effects.push("rebuild-artifact");
  if (["docker-container", "docker-compose-stack"].includes(deployment.runtimePlan.execution.kind))
    effects.push("replace-workload");
  if ((deployment.runtimePlan.execution.accessRoutes?.length ?? 0) > 0) effects.push("apply-route");
  if (
    deployment.runtimePlan.execution.healthCheck ||
    deployment.runtimePlan.execution.healthCheckPath
  )
    effects.push("verify-health-policy");
  return effects.length ? [...new Set(effects)] : ["no-runtime-change"];
}
function runtimeRef(evidence: DeploymentProofRuntimeEvidence): DeploymentProofEvidenceReference {
  return {
    kind: "runtime-readback",
    reference: evidence.workload.identity ?? evidence.workload.generation ?? "runtime-unavailable",
    summary: evidence.available
      ? "Current runtime evidence read"
      : "Current runtime evidence unavailable",
    observedAt: evidence.observedAt,
  };
}
function mismatch(
  reasonCode: DeploymentProofReasonCode,
  input: Omit<DeploymentProofMismatch, "reasonCode">,
): DeploymentProofMismatch {
  return { reasonCode, ...input };
}
function verdict(input: {
  deployment: DeploymentSummary;
  observed: DeploymentProofRuntimeEvidence;
  mismatches: DeploymentProofMismatch[];
  unavailable: DeploymentProofUnavailableEvidence[];
}): DeploymentProofVerdict {
  const currentId = input.observed.workload.deploymentId;
  if (currentId && currentId !== input.deployment.id) {
    return input.observed.workload.startedAt &&
      input.deployment.finishedAt &&
      input.observed.workload.startedAt > input.deployment.finishedAt
      ? "stale"
      : "failed";
  }
  if (
    input.deployment.status === "failed" ||
    input.mismatches.some((item) => item.severity === "critical")
  )
    return "failed";
  if (input.deployment.status !== "succeeded") return "unverified";
  if (input.unavailable.length)
    return input.observed.available ? "partially-verified" : "unverified";
  return input.mismatches.length ? "failed" : "verified";
}

@injectable()
export class DeploymentProofQueryService {
  constructor(
    @inject(tokens.deploymentReadModel) private readonly deploymentReadModel: DeploymentReadModel,
    @inject(tokens.deploymentProofRuntimeEvidenceReader)
    private readonly runtimeEvidenceReader: DeploymentProofRuntimeEvidenceReader,
    @inject(tokens.domainBindingReadModel)
    private readonly domainBindingReadModel: DomainBindingReadModel,
    @inject(tokens.clock) private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: DeploymentProofQuery,
  ): Promise<Result<DeploymentProof>> {
    const deployment = await this.deploymentReadModel.findOne(
      toRepositoryContext(context),
      DeploymentByIdSpec.create(DeploymentId.rehydrate(query.deploymentId)),
    );
    if (!deployment) return err(domainError.notFound("deployment", query.deploymentId));
    if (query.resourceId && query.resourceId !== deployment.resourceId) {
      return err(
        domainError.resourceContextMismatch(
          "Deployment does not belong to the requested resource",
          {
            queryName: "deployments.proof",
            deploymentId: deployment.id,
            expectedResourceId: query.resourceId,
            actualResourceId: deployment.resourceId,
          },
        ),
      );
    }
    let currentManagedRoutes: DeploymentProofManagedRoute[];
    try {
      const domainBindings = await this.domainBindingReadModel.list(toRepositoryContext(context), {
        projectId: deployment.projectId,
        environmentId: deployment.environmentId,
        resourceId: deployment.resourceId,
        limit: deploymentProofDomainBindingReadLimit,
      });
      if (domainBindings.length >= deploymentProofDomainBindingReadLimit) {
        return err(
          domainError.infra("Deployment proof route evidence is incomplete", {
            queryName: "deployments.proof",
            deploymentId: deployment.id,
            causeCode: "domain_binding_read_incomplete",
          }),
        );
      }
      currentManagedRoutes = domainBindings
        .filter(
          (binding) =>
            binding.status === "ready" && binding.proxyKind !== "none" && !binding.redirectTo,
        )
        .map((binding) => ({
          domainName: binding.domainName,
          pathPrefix: binding.pathPrefix,
          proxyKind: binding.proxyKind,
          tlsMode: binding.tlsMode,
        }));
    } catch {
      return err(
        domainError.infra("Deployment proof route evidence could not be assembled", {
          queryName: "deployments.proof",
          deploymentId: deployment.id,
          causeCode: "domain_binding_read_failed",
        }),
      );
    }
    const runtimeResult = await this.runtimeEvidenceReader.read(context, deployment, {
      currentManagedRoutes,
    });
    if (runtimeResult.isErr())
      return err(
        domainError.infra("Deployment proof evidence could not be assembled", {
          queryName: "deployments.proof",
          deploymentId: deployment.id,
          causeCode: runtimeResult.error.code,
        }),
      );
    const observed = runtimeResult.value;
    const plannedConfig = configurationFingerprint(deployment);
    const evidence: DeploymentProofEvidenceReference[] = [runtimeRef(observed)];
    const unavailableEvidence: DeploymentProofUnavailableEvidence[] = [];
    const mismatches: DeploymentProofMismatch[] = [];
    const addUnavailable = (
      kind: DeploymentProofUnavailableEvidence["kind"],
      reasonCode: string,
      summary: string,
    ) => unavailableEvidence.push({ kind, reasonCode, summary });

    if (!observed.available)
      addUnavailable(
        "workload",
        observed.reasonCode ?? "runtime_readback_unavailable",
        "Runtime readback is unavailable",
      );
    if (!observed.artifact.available || !observed.artifact.resolvedIdentity)
      addUnavailable(
        "artifact",
        observed.artifact.reasonCode ?? "artifact_identity_unavailable",
        "Resolved artifact identity is unavailable",
      );
    else {
      evidence.push({
        kind: "artifact-identity",
        reference: observed.artifact.resolvedIdentity,
        summary: "Resolved runtime artifact",
        observedAt: observed.observedAt,
      });
      const plannedArtifact = comparableArtifactReference(deployment);
      const plannedDigest = artifactDigest(plannedArtifact);
      const observedDigest = artifactDigest(observed.artifact.resolvedIdentity);
      const referenceMismatch = Boolean(
        plannedArtifact &&
          observed.artifact.reference &&
          plannedArtifact !== observed.artifact.reference,
      );
      const digestMismatch = Boolean(
        plannedDigest && observedDigest && plannedDigest !== observedDigest,
      );
      if (referenceMismatch || digestMismatch) {
        mismatches.push(
          mismatch("artifact_identity_mismatch", {
            severity: "critical",
            expected: plannedArtifact ?? "planned artifact identity",
            observed: observed.artifact.resolvedIdentity,
            evidence: [
              {
                kind: "artifact-identity",
                reference: observed.artifact.resolvedIdentity,
                summary: "Resolved runtime artifact",
                observedAt: observed.observedAt,
              },
            ],
            recommendedOperations: ["deployments.redeploy", "deployments.force-redeploy"],
          }),
        );
      }
    }
    if (!observed.workload.available || !observed.workload.generation)
      addUnavailable(
        "workload",
        observed.workload.reasonCode ?? "workload_identity_unavailable",
        "Workload identity or generation is unavailable",
      );
    else if (
      observed.workload.generation !== deployment.id ||
      (observed.workload.deploymentId && observed.workload.deploymentId !== deployment.id)
    ) {
      mismatches.push(
        mismatch("workload_generation_mismatch", {
          severity: "critical",
          expected: deployment.id,
          observed: observed.workload.generation,
          evidence: [runtimeRef(observed)],
          recommendedOperations: ["deployments.force-redeploy", "resources.diagnostic-summary"],
        }),
      );
    }
    if (!observed.configuration.available)
      addUnavailable(
        "configuration",
        observed.configuration.reasonCode ?? "configuration_evidence_unavailable",
        "Configuration evidence is unavailable",
      );
    else if (
      observed.configuration.matchesPlanned === false ||
      (observed.configuration.fingerprint && observed.configuration.fingerprint !== plannedConfig)
    ) {
      mismatches.push(
        mismatch("configuration_fingerprint_mismatch", {
          severity: "critical",
          expected: plannedConfig,
          ...(observed.configuration.fingerprint
            ? { observed: observed.configuration.fingerprint }
            : {}),
          evidence: [runtimeRef(observed)],
          recommendedOperations: ["deployments.redeploy", "deployments.force-redeploy"],
        }),
      );
    }
    if (observed.health.status === "failed")
      mismatches.push(
        mismatch("internal_health_failed", {
          severity: "critical",
          expected: "passed",
          observed: observed.health.summary,
          evidence: [],
          recommendedOperations: ["deployments.retry", "resources.diagnostic-summary"],
        }),
      );
    else if (observed.health.status === "unavailable")
      addUnavailable(
        "health",
        observed.health.reasonCode ?? "internal_health_unavailable",
        observed.health.summary,
      );
    if (observed.access.status === "failed")
      mismatches.push(
        mismatch("public_access_failed", {
          severity: "critical",
          expected: "passed",
          observed: observed.access.summary,
          evidence: [],
          recommendedOperations: ["deployments.retry", "resources.diagnostic-summary"],
        }),
      );
    else if (observed.access.status === "unavailable")
      addUnavailable(
        "access",
        observed.access.reasonCode ?? "public_access_unavailable",
        observed.access.summary,
      );
    if (observed.access.routeTargetsWorkload === false)
      mismatches.push(
        mismatch("access_route_workload_mismatch", {
          severity: "critical",
          expected: deployment.id,
          observed: observed.workload.deploymentId ?? "unavailable",
          evidence: [runtimeRef(observed)],
          recommendedOperations: ["deployments.force-redeploy", "resources.diagnostic-summary"],
        }),
      );

    const finalVerdict = verdict({
      deployment,
      observed,
      mismatches,
      unavailable: unavailableEvidence,
    });
    const artifact = artifactReference(deployment);
    return ok({
      schemaVersion: "deployments.proof/v1",
      deploymentId: deployment.id,
      resourceId: deployment.resourceId,
      verdict: finalVerdict,
      planned: {
        source: {
          reference: deployment.runtimePlan.source.displayName,
          ...(deployment.sourceCommitSha ? { revision: deployment.sourceCommitSha } : {}),
        },
        artifact: {
          ...(deployment.runtimePlan.runtimeArtifact?.intent
            ? { intent: deployment.runtimePlan.runtimeArtifact.intent }
            : {}),
          ...(artifact ? { reference: artifact } : {}),
        },
        resourceProfile: { fingerprint: resourceProfileFingerprint(deployment) },
        configuration: { fingerprint: plannedConfig },
        runtimeTarget: {
          kind: deployment.runtimePlan.target.kind,
          providerKey: deployment.runtimePlan.target.providerKey,
        },
        verificationSteps: deployment.runtimePlan.execution.verificationSteps ?? [],
        expectedEffects: expectedEffects(deployment),
      },
      observed,
      mismatches,
      evidence,
      unavailableEvidence,
      generatedAt: this.clock.now(),
      stateVersion: `${deployment.id}:${deployment.status}:${deployment.finishedAt ?? deployment.startedAt ?? deployment.createdAt}:${observed.observedAt}:${observed.workload.generation ?? "unknown"}`,
    });
  }
}
