import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type ProviderJobLogPruneResult,
  type ProviderJobLogRetentionStore,
} from "../../ports";
import { tokens } from "../../tokens";
import { type PruneProviderJobLogsCommand } from "./prune-provider-job-logs.command";

@injectable()
export class PruneProviderJobLogsUseCase {
  constructor(
    @inject(tokens.providerJobLogRetentionStore)
    private readonly providerJobLogRetentionStore: ProviderJobLogRetentionStore,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    command: PruneProviderJobLogsCommand,
  ): Promise<Result<ProviderJobLogPruneResult>> {
    try {
      const result = await this.providerJobLogRetentionStore.prune(toRepositoryContext(context), {
        before: command.before,
        dryRun: command.dryRun,
        ...(command.deploymentId ? { deploymentId: command.deploymentId } : {}),
        ...(command.providerKey ? { providerKey: command.providerKey } : {}),
        ...(command.resourceId ? { resourceId: command.resourceId } : {}),
        ...(command.serverId ? { serverId: command.serverId } : {}),
      });

      if (result.isErr()) {
        return err(result.error);
      }

      return ok({
        schemaVersion: "provider-job-logs.prune/v1",
        before: command.before,
        dryRun: command.dryRun,
        ...(command.deploymentId ? { deploymentId: command.deploymentId } : {}),
        ...(command.providerKey ? { providerKey: command.providerKey } : {}),
        ...(command.resourceId ? { resourceId: command.resourceId } : {}),
        ...(command.serverId ? { serverId: command.serverId } : {}),
        matchedCount: result.value.matchedCount,
        prunedCount: result.value.prunedCount,
        countsByProviderKey: result.value.countsByProviderKey,
        prunedAt: this.clock.now(),
      });
    } catch (error) {
      return err(
        domainError.infra("Provider job log retention prune could not be completed", {
          commandName: "provider-job-logs.prune",
          phase: "provider-job-log-retention",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }
}
