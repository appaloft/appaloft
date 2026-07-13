import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type DeploymentReadModel,
  type DeploymentStaleAttemptsResult,
} from "../../ports";
import { tokens } from "../../tokens";
import {
  isActiveDeploymentStatus,
  observeDeploymentStaleness,
} from "./deployment-stale-attempt.policy";
import { type ListStaleDeploymentAttemptsQuery } from "./list-stale-deployment-attempts.query";

@injectable()
export class ListStaleDeploymentAttemptsQueryService {
  constructor(
    @inject(tokens.deploymentReadModel) private readonly readModel: DeploymentReadModel,
    @inject(tokens.clock) private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ListStaleDeploymentAttemptsQuery,
  ): Promise<DeploymentStaleAttemptsResult> {
    const checkedAt = this.clock.now();
    const deployments = await this.readModel.list(toRepositoryContext(context), {
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      limit: query.limit,
    });
    const items = deployments.flatMap((deployment) => {
      const observation = observeDeploymentStaleness(
        {
          id: deployment.id,
          status: deployment.status,
          createdAt: deployment.createdAt,
          ...(deployment.startedAt ? { startedAt: deployment.startedAt } : {}),
          timeline: deployment.timeline,
        },
        { checkedAt, staleAfterSeconds: query.staleAfterSeconds },
      );
      return observation.stale && isActiveDeploymentStatus(deployment.status)
        ? [
            {
              deploymentId: deployment.id,
              projectId: deployment.projectId,
              environmentId: deployment.environmentId,
              resourceId: deployment.resourceId,
              status: deployment.status,
              latestActivityAt: observation.latestActivityAt,
              staleForSeconds: observation.staleForSeconds,
              staleAfterSeconds: query.staleAfterSeconds,
              stateVersion: observation.stateVersion,
              runtimeCancellationRequired: observation.runtimeCancellationRequired,
            },
          ]
        : [];
    });
    return {
      schemaVersion: "deployments.stale-attempts/v1",
      items,
      checkedAt,
      staleAfterSeconds: query.staleAfterSeconds,
    };
  }
}
