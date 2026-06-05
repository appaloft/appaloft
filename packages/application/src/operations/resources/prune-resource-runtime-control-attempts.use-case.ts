import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type ResourceRuntimeControlAttemptPruneResult,
  type ResourceRuntimeControlAttemptRetentionStore,
} from "../../ports";
import { tokens } from "../../tokens";
import { type PruneResourceRuntimeControlAttemptsCommand } from "./prune-resource-runtime-control-attempts.command";

@injectable()
export class PruneResourceRuntimeControlAttemptsUseCase {
  constructor(
    @inject(tokens.resourceRuntimeControlAttemptRetentionStore)
    private readonly retentionStore: ResourceRuntimeControlAttemptRetentionStore,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    command: PruneResourceRuntimeControlAttemptsCommand,
  ): Promise<Result<ResourceRuntimeControlAttemptPruneResult>> {
    try {
      const result = await this.retentionStore.prune(toRepositoryContext(context), {
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
        schemaVersion: "resources.runtime-control-attempts.prune/v1",
        before: command.before,
        ...(command.deploymentId ? { deploymentId: command.deploymentId } : {}),
        ...(command.resourceId ? { resourceId: command.resourceId } : {}),
        ...(command.serverId ? { serverId: command.serverId } : {}),
        dryRun: command.dryRun,
        matchedCount: result.value.matchedCount,
        prunedCount: result.value.prunedCount,
        affectedResourceCount: result.value.affectedResourceCount,
        affectedDeploymentCount: result.value.affectedDeploymentCount,
        prunedAt: this.clock.now(),
      });
    } catch (error) {
      return err(
        domainError.infra(
          "Resource runtime control attempt retention prune could not be completed",
          {
            commandName: "resources.runtime-control-attempts.prune",
            phase: "resource-runtime-control-attempt-retention",
            reason: error instanceof Error ? error.message : "unknown",
          },
        ),
      );
    }
  }
}
