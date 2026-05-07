import {
  DeploymentByIdSpec,
  DeploymentId,
  type DeploymentStatus,
  domainError,
  err,
  ok,
  ResourceByIdSpec,
  ResourceId,
  type Result,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type DeploymentReadModel,
  type DeploymentRecoveryActionReadiness,
  type DeploymentRecoveryReadiness,
  type DeploymentRecoveryReadinessReason,
  type DeploymentRecoveryReasonCode,
  type DeploymentRecoveryRecommendedAction,
  type DeploymentSummary,
  type ResourceReadModel,
  type RollbackCandidateReadiness,
} from "../../ports";
import { tokens } from "../../tokens";
import { type DeploymentRecoveryReadinessQuery } from "./deployment-recovery-readiness.query";

const activeDeploymentStatuses = new Set<DeploymentStatus>([
  "created",
  "planning",
  "planned",
  "running",
  "cancel-requested",
]);
const retryableDeploymentStatuses = new Set<DeploymentStatus>(["failed", "canceled"]);
const recoveryCommandActive = {
  retry: true,
  redeploy: true,
  rollback: true,
} as const;

function reason(
  code: DeploymentRecoveryReasonCode,
  input: {
    category?: DeploymentRecoveryReadinessReason["category"];
    phase?: string;
    relatedDeploymentId?: string;
    relatedEntityId?: string;
    relatedEntityType?: string;
    retriable?: boolean;
    recommendation?: string;
  } = {},
): DeploymentRecoveryReadinessReason {
  return {
    code,
    category: input.category ?? "blocked",
    phase: input.phase ?? "recovery-readiness",
    retriable: input.retriable ?? false,
    ...(input.relatedDeploymentId ? { relatedDeploymentId: input.relatedDeploymentId } : {}),
    ...(input.relatedEntityId ? { relatedEntityId: input.relatedEntityId } : {}),
    ...(input.relatedEntityType ? { relatedEntityType: input.relatedEntityType } : {}),
    ...(input.recommendation ? { recommendation: input.recommendation } : {}),
  };
}

function deploymentReadNotFound(deploymentId: string) {
  return {
    ...domainError.notFound("deployment", deploymentId),
    details: {
      queryName: "deployments.recovery-readiness",
      phase: "deployment-resolution",
      deploymentId,
    },
  };
}

function recoveryReadInfraError(deploymentId: string, error: unknown) {
  return domainError.infra("Deployment recovery readiness could not be assembled", {
    queryName: "deployments.recovery-readiness",
    phase: "read-model-load",
    deploymentId,
    reason: error instanceof Error ? error.message : "unknown",
  });
}

function contextMismatch(input: {
  deploymentId: string;
  expectedResourceId: string;
  actualResourceId: string;
}) {
  return domainError.resourceContextMismatch(
    "Deployment does not belong to the requested resource",
    {
      queryName: "deployments.recovery-readiness",
      phase: "deployment-resource-context",
      deploymentId: input.deploymentId,
      expectedResourceId: input.expectedResourceId,
      actualResourceId: input.actualResourceId,
    },
  );
}

function hasRetrySnapshot(deployment: DeploymentSummary): boolean {
  return Boolean(deployment.runtimePlan && deployment.environmentSnapshot);
}

function hasRollbackArtifact(deployment: DeploymentSummary): boolean {
  return Boolean(
    deployment.runtimePlan.runtimeArtifact?.image ||
      deployment.runtimePlan.runtimeArtifact?.composeFile ||
      deployment.runtimePlan.execution.image ||
      deployment.runtimePlan.execution.composeFile,
  );
}

function sourceSummary(deployment: DeploymentSummary): string | undefined {
  return deployment.sourceCommitSha
    ? `${deployment.runtimePlan.source.displayName}@${deployment.sourceCommitSha.slice(0, 12)}`
    : deployment.runtimePlan.source.displayName;
}

function artifactSummary(deployment: DeploymentSummary): string | undefined {
  return (
    deployment.runtimePlan.runtimeArtifact?.image ??
    deployment.runtimePlan.runtimeArtifact?.composeFile ??
    deployment.runtimePlan.execution.image ??
    deployment.runtimePlan.execution.composeFile
  );
}

function runtimeTargetSummary(deployment: DeploymentSummary): string {
  return `${deployment.runtimePlan.target.kind}:${deployment.runtimePlan.target.providerKey}`;
}

function toRollbackCandidate(deployment: DeploymentSummary): RollbackCandidateReadiness {
  const candidateSourceSummary = sourceSummary(deployment);
  const candidateArtifactSummary = artifactSummary(deployment);
  const reasons = hasRollbackArtifact(deployment)
    ? []
    : [
        reason("runtime-artifact-missing", {
          relatedDeploymentId: deployment.id,
          recommendation: "Choose another successful deployment or redeploy the current profile.",
        }),
      ];

  return {
    deploymentId: deployment.id,
    finishedAt: deployment.finishedAt ?? deployment.createdAt,
    status: "succeeded",
    ...(candidateSourceSummary ? { sourceSummary: candidateSourceSummary } : {}),
    ...(candidateArtifactSummary ? { artifactSummary: candidateArtifactSummary } : {}),
    environmentSnapshotId: deployment.environmentSnapshot.id,
    runtimeTargetSummary: runtimeTargetSummary(deployment),
    rollbackReady: reasons.length === 0,
    reasons,
  };
}

function actionReadiness(input: {
  targetOperation: DeploymentRecoveryActionReadiness["targetOperation"];
  technicalReady: boolean;
  commandActive: boolean;
  reasons: DeploymentRecoveryReadinessReason[];
}): DeploymentRecoveryActionReadiness {
  const commandUnavailableReason = input.commandActive
    ? []
    : [
        reason("recovery-command-not-active", {
          phase: "operation-catalog",
          recommendation: `${input.targetOperation} is not active yet.`,
        }),
      ];

  return {
    allowed: input.technicalReady && input.commandActive,
    commandActive: input.commandActive,
    targetOperation: input.targetOperation,
    reasons: [...input.reasons, ...(input.technicalReady ? commandUnavailableReason : [])],
  };
}

function recommendedActions(input: {
  retryable: boolean;
  redeployable: boolean;
  rollbackReady: boolean;
}): DeploymentRecoveryRecommendedAction[] {
  const actions: DeploymentRecoveryRecommendedAction[] = [
    {
      kind: "query",
      targetOperation: "deployments.show",
      label: "Inspect deployment detail",
      safeByDefault: true,
    },
    {
      kind: "query",
      targetOperation: "deployments.logs",
      label: "Inspect deployment logs",
      safeByDefault: true,
    },
    {
      kind: "query",
      targetOperation: "deployments.stream-events",
      label: "Replay deployment events",
      safeByDefault: true,
    },
    {
      kind: "query",
      targetOperation: "resources.diagnostic-summary",
      label: "Collect diagnostic summary",
      safeByDefault: true,
    },
  ];

  if (input.retryable) {
    actions.push({
      kind: "command",
      targetOperation: "deployments.retry",
      label: "Retry the deployment attempt",
      safeByDefault: false,
      commandActive: recoveryCommandActive.retry,
      ...(recoveryCommandActive.retry ? {} : { blockedReasonCode: "recovery-command-not-active" }),
    });
  }

  if (input.redeployable) {
    actions.push({
      kind: "command",
      targetOperation: "deployments.redeploy",
      label: "Redeploy the current resource profile",
      safeByDefault: false,
      commandActive: recoveryCommandActive.redeploy,
      ...(recoveryCommandActive.redeploy
        ? {}
        : { blockedReasonCode: "recovery-command-not-active" }),
    });
  }

  if (input.rollbackReady) {
    actions.push({
      kind: "command",
      targetOperation: "deployments.rollback",
      label: "Roll back to a retained successful deployment",
      safeByDefault: false,
      commandActive: recoveryCommandActive.rollback,
      ...(recoveryCommandActive.rollback
        ? {}
        : { blockedReasonCode: "recovery-command-not-active" }),
    });
  }

  return actions;
}

@injectable()
export class DeploymentRecoveryReadinessQueryService {
  constructor(
    @inject(tokens.deploymentReadModel)
    private readonly deploymentReadModel: DeploymentReadModel,
    @inject(tokens.resourceReadModel)
    private readonly resourceReadModel: ResourceReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: DeploymentRecoveryReadinessQuery,
  ): Promise<Result<DeploymentRecoveryReadiness>> {
    const repositoryContext = toRepositoryContext(context);

    try {
      const deployment = await this.deploymentReadModel.findOne(
        repositoryContext,
        DeploymentByIdSpec.create(DeploymentId.rehydrate(query.deploymentId)),
      );

      if (!deployment) {
        return err(deploymentReadNotFound(query.deploymentId));
      }

      if (query.resourceId && query.resourceId !== deployment.resourceId) {
        return err(
          contextMismatch({
            deploymentId: deployment.id,
            expectedResourceId: query.resourceId,
            actualResourceId: deployment.resourceId,
          }),
        );
      }

      const [resource, sameResourceDeployments] = await Promise.all([
        this.resourceReadModel.findOne(
          repositoryContext,
          ResourceByIdSpec.create(ResourceId.rehydrate(deployment.resourceId)),
        ),
        this.deploymentReadModel.list(repositoryContext, {
          resourceId: deployment.resourceId,
        }),
      ]);

      const activeDeployment = sameResourceDeployments.find((candidate) =>
        activeDeploymentStatuses.has(candidate.status),
      );

      const retryReasons: DeploymentRecoveryReadinessReason[] = [];
      if (activeDeploymentStatuses.has(deployment.status)) {
        retryReasons.push(
          reason("attempt-not-terminal", {
            relatedDeploymentId: deployment.id,
            recommendation:
              "Wait for the active deployment to finish or inspect deployment events.",
          }),
        );
      } else if (!retryableDeploymentStatuses.has(deployment.status)) {
        retryReasons.push(
          reason("attempt-status-not-recoverable", {
            relatedDeploymentId: deployment.id,
            recommendation: "Inspect deployment detail or redeploy the current resource profile.",
          }),
        );
      }

      if (!hasRetrySnapshot(deployment)) {
        retryReasons.push(
          reason("snapshot-missing", {
            relatedDeploymentId: deployment.id,
            recommendation: "Redeploy the current resource profile.",
          }),
        );
      }

      const redeployReasons: DeploymentRecoveryReadinessReason[] = [];
      if (!resource) {
        redeployReasons.push(
          reason("resource-profile-invalid", {
            relatedEntityId: deployment.resourceId,
            relatedEntityType: "resource",
            recommendation: "Inspect or recreate the resource profile before redeploying.",
          }),
        );
      }

      if (activeDeployment) {
        redeployReasons.push(
          reason("resource-runtime-busy", {
            relatedDeploymentId: activeDeployment.id,
            recommendation: "Wait for the active deployment to finish before recovery.",
          }),
        );
      }

      const rollbackCandidates = sameResourceDeployments
        .filter((candidate) => candidate.id !== deployment.id && candidate.status === "succeeded")
        .sort((left, right) =>
          (right.finishedAt ?? right.createdAt).localeCompare(left.finishedAt ?? left.createdAt),
        )
        .map(toRollbackCandidate);

      const readyRollbackCandidate = rollbackCandidates.find(
        (candidate) => candidate.rollbackReady,
      );
      const rollbackReasons: DeploymentRecoveryReadinessReason[] = readyRollbackCandidate
        ? []
        : rollbackCandidates.length === 0
          ? [
              reason("rollback-candidate-not-successful", {
                recommendation: "Redeploy the current profile or wait for a successful candidate.",
              }),
            ]
          : [
              reason("runtime-artifact-missing", {
                recommendation: "Choose another candidate or redeploy the current profile.",
              }),
            ];

      const retryable = retryReasons.length === 0;
      const redeployable = redeployReasons.length === 0;
      const rollbackReady = Boolean(readyRollbackCandidate);
      const maxCandidates = query.maxCandidates ?? 5;
      const returnedCandidates = query.includeCandidates
        ? rollbackCandidates.slice(0, maxCandidates)
        : [];

      return ok({
        schemaVersion: "deployments.recovery-readiness/v1",
        deploymentId: deployment.id,
        resourceId: deployment.resourceId,
        generatedAt: this.clock.now(),
        stateVersion: `${deployment.id}:${deployment.status}:${
          deployment.finishedAt ?? deployment.startedAt ?? deployment.createdAt
        }:${deployment.logCount}`,
        recoverable: retryable || redeployable || rollbackReady,
        retryable,
        redeployable,
        rollbackReady,
        rollbackCandidateCount: rollbackCandidates.length,
        retry: actionReadiness({
          targetOperation: "deployments.retry",
          technicalReady: retryable,
          commandActive: recoveryCommandActive.retry,
          reasons: retryReasons,
        }),
        redeploy: actionReadiness({
          targetOperation: "deployments.redeploy",
          technicalReady: redeployable,
          commandActive: recoveryCommandActive.redeploy,
          reasons: redeployReasons,
        }),
        rollback: {
          allowed: rollbackReady && recoveryCommandActive.rollback,
          commandActive: recoveryCommandActive.rollback,
          reasons: [
            ...rollbackReasons,
            ...(rollbackReady && !recoveryCommandActive.rollback
              ? [
                  reason("recovery-command-not-active", {
                    phase: "operation-catalog",
                    recommendation: "deployments.rollback is not active yet.",
                  }),
                ]
              : []),
          ],
          candidates: returnedCandidates,
          ...(readyRollbackCandidate
            ? { recommendedCandidateId: readyRollbackCandidate.deploymentId }
            : {}),
        },
        recommendedActions: recommendedActions({
          retryable,
          redeployable,
          rollbackReady,
        }),
      });
    } catch (error) {
      return err(recoveryReadInfraError(query.deploymentId, error));
    }
  }
}
