import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type DomainEventStreamPruneResult,
  type DomainEventStreamRetentionStore,
} from "../../ports";
import { tokens } from "../../tokens";
import { type PruneDomainEventsCommand } from "./prune-domain-events.command";

@injectable()
export class PruneDomainEventsUseCase {
  constructor(
    @inject(tokens.domainEventStreamRetentionStore)
    private readonly domainEventStreamRetentionStore: DomainEventStreamRetentionStore,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    command: PruneDomainEventsCommand,
  ): Promise<Result<DomainEventStreamPruneResult>> {
    try {
      const result = await this.domainEventStreamRetentionStore.prune(
        toRepositoryContext(context),
        {
          before: command.before,
          dryRun: command.dryRun,
          ...(command.eventType ? { eventType: command.eventType } : {}),
          ...(command.aggregateId ? { aggregateId: command.aggregateId } : {}),
          ...(command.aggregateType ? { aggregateType: command.aggregateType } : {}),
          ...(command.deploymentId ? { deploymentId: command.deploymentId } : {}),
          ...(typeof command.limit === "number" ? { limit: command.limit } : {}),
        },
      );

      if (result.isErr()) {
        return err(result.error);
      }

      return ok({
        schemaVersion: "domain-events.prune/v1",
        before: command.before,
        dryRun: command.dryRun,
        ...(command.eventType ? { eventType: command.eventType } : {}),
        ...(command.aggregateId ? { aggregateId: command.aggregateId } : {}),
        ...(command.aggregateType ? { aggregateType: command.aggregateType } : {}),
        ...(command.deploymentId ? { deploymentId: command.deploymentId } : {}),
        ...(typeof command.limit === "number" ? { limit: command.limit } : {}),
        inspectedCount: result.value.inspectedCount,
        candidateCount: result.value.candidateCount,
        prunedCount: result.value.prunedCount,
        skippedCount: result.value.skippedCount,
        countsByEventType: result.value.countsByEventType,
        skippedCountsByReason: result.value.skippedCountsByReason,
        prunedAt: this.clock.now(),
      });
    } catch (error) {
      return err(
        domainError.infra("Domain event stream retention prune could not be completed", {
          commandName: "domain-events.prune",
          phase: "domain-event-stream-retention",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }
}
