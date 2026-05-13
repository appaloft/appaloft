import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type DeploymentLogPruneResult,
  type DeploymentLogRetentionStore,
} from "../../ports";
import { tokens } from "../../tokens";
import { type PruneDeploymentLogsCommand } from "./prune-deployment-logs.command";

@injectable()
export class PruneDeploymentLogsUseCase {
  constructor(
    @inject(tokens.deploymentLogRetentionStore)
    private readonly deploymentLogRetentionStore: DeploymentLogRetentionStore,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    command: PruneDeploymentLogsCommand,
  ): Promise<Result<DeploymentLogPruneResult>> {
    try {
      const result = await this.deploymentLogRetentionStore.prune(toRepositoryContext(context), {
        before: command.before,
        dryRun: command.dryRun,
        ...(command.deploymentId ? { deploymentId: command.deploymentId } : {}),
        ...(command.resourceId ? { resourceId: command.resourceId } : {}),
        ...(command.serverId ? { serverId: command.serverId } : {}),
      });

      if (result.isErr()) {
        return err(result.error);
      }

      return ok({
        schemaVersion: "deployments.logs.prune/v1",
        before: command.before,
        dryRun: command.dryRun,
        ...(command.deploymentId ? { deploymentId: command.deploymentId } : {}),
        ...(command.resourceId ? { resourceId: command.resourceId } : {}),
        ...(command.serverId ? { serverId: command.serverId } : {}),
        matchedCount: result.value.matchedCount,
        prunedCount: result.value.prunedCount,
        affectedDeploymentCount: result.value.affectedDeploymentCount,
        prunedAt: this.clock.now(),
      });
    } catch (error) {
      return err(
        domainError.infra("Deployment log retention prune could not be completed", {
          commandName: "deployments.logs.prune",
          phase: "deployment-log-retention",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }
}
