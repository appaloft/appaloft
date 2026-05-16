import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type SourceEventPruneResult,
  type SourceEventRetentionStore,
} from "../../ports";
import { tokens } from "../../tokens";
import { type PruneSourceEventsCommand } from "./prune-source-events.command";

@injectable()
export class PruneSourceEventsUseCase {
  constructor(
    @inject(tokens.sourceEventRetentionStore)
    private readonly sourceEventRetentionStore: SourceEventRetentionStore,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    command: PruneSourceEventsCommand,
  ): Promise<Result<SourceEventPruneResult>> {
    try {
      const result = await this.sourceEventRetentionStore.prune(toRepositoryContext(context), {
        before: command.before,
        dryRun: command.dryRun,
        ...(command.projectId ? { projectId: command.projectId } : {}),
        ...(command.resourceId ? { resourceId: command.resourceId } : {}),
        ...(command.status ? { status: command.status } : {}),
        ...(command.sourceKind ? { sourceKind: command.sourceKind } : {}),
      });

      if (result.isErr()) {
        return err(result.error);
      }

      return ok({
        schemaVersion: "source-events.prune/v1",
        before: command.before,
        dryRun: command.dryRun,
        ...(command.projectId ? { projectId: command.projectId } : {}),
        ...(command.resourceId ? { resourceId: command.resourceId } : {}),
        ...(command.status ? { status: command.status } : {}),
        ...(command.sourceKind ? { sourceKind: command.sourceKind } : {}),
        matchedCount: result.value.matchedCount,
        prunedCount: result.value.prunedCount,
        countsByStatus: result.value.countsByStatus,
        countsBySourceKind: result.value.countsBySourceKind,
        prunedAt: this.clock.now(),
      });
    } catch (error) {
      return err(
        domainError.infra("Source event retention prune could not be completed", {
          commandName: "source-events.prune",
          phase: "source-event-retention",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }
}
