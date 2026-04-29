import {
  DeploymentByIdSpec,
  DeploymentId,
  DeploymentTargetId,
  type DomainError,
  domainError,
  EnvironmentByIdSpec,
  EnvironmentId,
  err,
  ok,
  ProjectByIdSpec,
  ProjectId,
  ResourceByIdSpec,
  ResourceId,
  type Result,
  ServerByIdSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type DeploymentAttemptFailureSummary,
  type DeploymentAttemptRecoverySummary,
  type DeploymentDetail,
  type DeploymentDetailSectionError,
  type DeploymentDetailSummary,
  type DeploymentReadModel,
  type DeploymentRelatedContext,
  type DeploymentSummary,
  type EnvironmentReadModel,
  type ProjectReadModel,
  type ResourceReadModel,
  type ServerReadModel,
} from "../../ports";
import { tokens } from "../../tokens";
import { DeploymentRecoveryReadinessQuery } from "./deployment-recovery-readiness.query";
import { type DeploymentRecoveryReadinessQueryService } from "./deployment-recovery-readiness.query-service";
import { type ShowDeploymentQuery } from "./show-deployment.query";

function withShowDeploymentDetails(
  error: DomainError,
  details: Record<string, string | number | boolean | null>,
): DomainError {
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      queryName: "deployments.show",
      ...details,
    },
  };
}

function deploymentReadNotFound(deploymentId: string): DomainError {
  return withShowDeploymentDetails(domainError.notFound("deployment", deploymentId), {
    phase: "deployment-resolution",
    deploymentId,
  });
}

function deploymentReadInfraError(deploymentId: string, error: unknown): DomainError {
  return domainError.infra("Deployment detail could not be assembled", {
    queryName: "deployments.show",
    phase: "read-model-load",
    deploymentId,
    reason: error instanceof Error ? error.message : "unknown",
  });
}

function toDeploymentDetailSummary(deployment: DeploymentSummary): DeploymentDetailSummary {
  const { logs: _logs, ...summary } = deployment;
  return summary;
}

function latestFailureFromLogs(
  deployment: DeploymentSummary,
): DeploymentAttemptFailureSummary | undefined {
  const recentFailure =
    [...deployment.logs]
      .reverse()
      .find((entry) => entry.level === "error" || entry.level === "warn") ??
    (deployment.status === "failed" ? deployment.logs.at(-1) : undefined);

  if (!recentFailure) {
    return undefined;
  }

  return {
    timestamp: recentFailure.timestamp,
    source: recentFailure.source,
    phase: recentFailure.phase,
    level: recentFailure.level,
    message: recentFailure.message,
  };
}

function relatedContextError(
  _deploymentId: string,
  relatedEntityId?: string,
): DeploymentDetailSectionError {
  return {
    section: "related-context",
    code: "deployment_related_context_unavailable",
    category: "application",
    phase: "related-context-resolution",
    retriable: false,
    ...(relatedEntityId ? { relatedEntityId } : {}),
  };
}

@injectable()
export class ShowDeploymentQueryService {
  constructor(
    @inject(tokens.deploymentReadModel)
    private readonly deploymentReadModel: DeploymentReadModel,
    @inject(tokens.projectReadModel)
    private readonly projectReadModel: ProjectReadModel,
    @inject(tokens.environmentReadModel)
    private readonly environmentReadModel: EnvironmentReadModel,
    @inject(tokens.resourceReadModel)
    private readonly resourceReadModel: ResourceReadModel,
    @inject(tokens.serverReadModel)
    private readonly serverReadModel: ServerReadModel,
    @inject(tokens.deploymentRecoveryReadinessQueryService)
    private readonly recoveryReadinessQueryService: DeploymentRecoveryReadinessQueryService,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ShowDeploymentQuery,
  ): Promise<Result<DeploymentDetail>> {
    const repositoryContext = toRepositoryContext(context);

    try {
      const deployment = await this.deploymentReadModel.findOne(
        repositoryContext,
        DeploymentByIdSpec.create(DeploymentId.rehydrate(query.deploymentId)),
      );

      if (!deployment) {
        return err(deploymentReadNotFound(query.deploymentId));
      }

      const sectionErrors: DeploymentDetailSectionError[] = [];
      const detailSummary = toDeploymentDetailSummary(deployment);
      let relatedContext: DeploymentRelatedContext | undefined;

      if (query.includeRelatedContext) {
        try {
          const [project, environment, resource, server] = await Promise.all([
            this.projectReadModel.findOne(
              repositoryContext,
              ProjectByIdSpec.create(ProjectId.rehydrate(deployment.projectId)),
            ),
            this.environmentReadModel.findOne(
              repositoryContext,
              EnvironmentByIdSpec.create(EnvironmentId.rehydrate(deployment.environmentId)),
            ),
            this.resourceReadModel.findOne(
              repositoryContext,
              ResourceByIdSpec.create(ResourceId.rehydrate(deployment.resourceId)),
            ),
            this.serverReadModel.findOne(
              repositoryContext,
              ServerByIdSpec.create(DeploymentTargetId.rehydrate(deployment.serverId)),
            ),
          ]);

          relatedContext = {
            project: {
              id: deployment.projectId,
              ...(project?.name ? { name: project.name } : {}),
              ...(project?.slug ? { slug: project.slug } : {}),
            },
            environment: {
              id: deployment.environmentId,
              ...(environment?.name ? { name: environment.name } : {}),
              ...(environment?.kind ? { kind: environment.kind } : {}),
            },
            resource: {
              id: deployment.resourceId,
              ...(resource?.name ? { name: resource.name } : {}),
              ...(resource?.slug ? { slug: resource.slug } : {}),
              ...(resource?.kind ? { kind: resource.kind } : {}),
            },
            server: {
              id: deployment.serverId,
              ...(server?.name ? { name: server.name } : {}),
              ...(server?.host ? { host: server.host } : {}),
              ...(typeof server?.port === "number" ? { port: server.port } : {}),
              ...(server?.providerKey ? { providerKey: server.providerKey } : {}),
            },
            destination: {
              id: deployment.destinationId,
            },
          };

          if (!project || !environment || !resource || !server) {
            sectionErrors.push(
              relatedContextError(
                deployment.id,
                !project
                  ? deployment.projectId
                  : !environment
                    ? deployment.environmentId
                    : !resource
                      ? deployment.resourceId
                      : deployment.serverId,
              ),
            );
          }
        } catch {
          sectionErrors.push(relatedContextError(deployment.id));
        }
      }

      const latestFailure = query.includeLatestFailure
        ? latestFailureFromLogs(deployment)
        : undefined;
      let recoverySummary: DeploymentAttemptRecoverySummary | undefined;

      if (query.includeRecoverySummary) {
        const readinessResult = await this.recoveryReadinessQueryService.execute(
          context,
          DeploymentRecoveryReadinessQuery.create({
            deploymentId: deployment.id,
            resourceId: deployment.resourceId,
            includeCandidates: false,
          })._unsafeUnwrap(),
        );

        if (readinessResult.isOk()) {
          const readiness = readinessResult._unsafeUnwrap();
          recoverySummary = {
            source: "deployments.recovery-readiness",
            retryable: readiness.retryable,
            redeployable: readiness.redeployable,
            rollbackReady: readiness.rollbackReady,
            rollbackCandidateCount: readiness.rollbackCandidateCount,
            blockedReasonCodes: [
              ...readiness.retry.reasons,
              ...readiness.redeploy.reasons,
              ...readiness.rollback.reasons,
            ].map((reason) => reason.code),
          };
        }
      }

      return ok({
        schemaVersion: "deployments.show/v1",
        deployment: detailSummary,
        status: {
          current: deployment.status,
          createdAt: deployment.createdAt,
          ...(deployment.startedAt ? { startedAt: deployment.startedAt } : {}),
          ...(deployment.finishedAt ? { finishedAt: deployment.finishedAt } : {}),
          ...(deployment.rollbackOfDeploymentId
            ? { rollbackOfDeploymentId: deployment.rollbackOfDeploymentId }
            : {}),
        },
        ...(relatedContext ? { relatedContext } : {}),
        ...(query.includeSnapshot
          ? {
              snapshot: {
                runtimePlan: detailSummary.runtimePlan,
                environmentSnapshot: detailSummary.environmentSnapshot,
              },
            }
          : {}),
        ...(query.includeTimeline
          ? {
              timeline: {
                createdAt: deployment.createdAt,
                ...(deployment.startedAt ? { startedAt: deployment.startedAt } : {}),
                ...(deployment.finishedAt ? { finishedAt: deployment.finishedAt } : {}),
                logCount: deployment.logCount,
              },
            }
          : {}),
        ...(latestFailure ? { latestFailure } : {}),
        ...(recoverySummary ? { recoverySummary } : {}),
        nextActions: ["logs", "resource-detail", "resource-health", "diagnostic-summary"],
        sectionErrors,
        generatedAt: this.clock.now(),
      });
    } catch (error) {
      return err(deploymentReadInfraError(query.deploymentId, error));
    }
  }
}
