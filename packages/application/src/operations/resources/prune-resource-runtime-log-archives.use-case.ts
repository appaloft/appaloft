import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type ResourceRuntimeLogArchivePruneResult,
  type ResourceRuntimeLogArchiveStore,
} from "../../ports";
import { tokens } from "../../tokens";
import { type PruneResourceRuntimeLogArchivesCommand } from "./prune-resource-runtime-log-archives.command";

@injectable()
export class PruneResourceRuntimeLogArchivesUseCase {
  constructor(
    @inject(tokens.resourceRuntimeLogArchiveStore)
    private readonly archiveStore: ResourceRuntimeLogArchiveStore,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    command: PruneResourceRuntimeLogArchivesCommand,
  ): Promise<Result<ResourceRuntimeLogArchivePruneResult>> {
    try {
      const result = await this.archiveStore.prune(toRepositoryContext(context), {
        before: command.before,
        dryRun: command.dryRun,
        ...(command.resourceId ? { resourceId: command.resourceId } : {}),
        ...(command.deploymentId ? { deploymentId: command.deploymentId } : {}),
        ...(command.serverId ? { serverId: command.serverId } : {}),
        ...(command.serviceName ? { serviceName: command.serviceName } : {}),
      });

      if (result.isErr()) {
        return err(result.error);
      }

      return ok({
        schemaVersion: "resources.runtime-log-archives.prune/v1",
        before: command.before,
        dryRun: command.dryRun,
        ...(command.resourceId ? { resourceId: command.resourceId } : {}),
        ...(command.deploymentId ? { deploymentId: command.deploymentId } : {}),
        ...(command.serverId ? { serverId: command.serverId } : {}),
        ...(command.serviceName ? { serviceName: command.serviceName } : {}),
        matchedCount: result.value.matchedCount,
        prunedCount: result.value.prunedCount,
        affectedResourceCount: result.value.affectedResourceCount,
        prunedAt: this.clock.now(),
      });
    } catch (error) {
      return err(
        domainError.infra("Runtime log archive retention prune could not be completed", {
          commandName: "resources.runtime-log-archives.prune",
          phase: "runtime-log-archive-retention",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }
}
