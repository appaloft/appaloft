import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type DeploymentAttemptPruneResult,
  type DeploymentAttemptRetentionStore,
} from "../../ports";
import { tokens } from "../../tokens";
import { type PruneDeploymentsCommand } from "./prune-deployments.command";

@injectable()
export class PruneDeploymentsUseCase {
  constructor(
    @inject(tokens.deploymentAttemptRetentionStore)
    private readonly deploymentAttemptRetentionStore: DeploymentAttemptRetentionStore,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    command: PruneDeploymentsCommand,
  ): Promise<Result<DeploymentAttemptPruneResult>> {
    try {
      const result = await this.deploymentAttemptRetentionStore.prune(
        toRepositoryContext(context),
        {
          before: command.before,
          dryRun: command.dryRun,
          ...(command.deploymentId ? { deploymentId: command.deploymentId } : {}),
          ...(command.resourceId ? { resourceId: command.resourceId } : {}),
          ...(command.serverId ? { serverId: command.serverId } : {}),
        },
      );

      if (result.isErr()) {
        return err(result.error);
      }

      return ok({
        schemaVersion: "deployments.prune/v1",
        before: command.before,
        ...(command.deploymentId ? { deploymentId: command.deploymentId } : {}),
        ...(command.resourceId ? { resourceId: command.resourceId } : {}),
        ...(command.serverId ? { serverId: command.serverId } : {}),
        dryRun: command.dryRun,
        matchedCount: result.value.matchedCount,
        prunedCount: result.value.prunedCount,
        guardedCount: result.value.guardedCount,
        affectedDeploymentIds: result.value.affectedDeploymentIds,
        guardedDeploymentIds: result.value.guardedDeploymentIds,
        prunedAt: this.clock.now(),
      });
    } catch (error) {
      return err(
        domainError.infra("Deployment attempt prune could not be completed", {
          commandName: "deployments.prune",
          phase: "deployment-attempt-retention",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }
}
