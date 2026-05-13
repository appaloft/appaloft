import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type AuditEventPruneResult, type AuditEventRetentionStore, type Clock } from "../../ports";
import { tokens } from "../../tokens";
import { type PruneAuditEventsCommand } from "./prune-audit-events.command";

@injectable()
export class PruneAuditEventsUseCase {
  constructor(
    @inject(tokens.auditEventRetentionStore)
    private readonly auditEventRetentionStore: AuditEventRetentionStore,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    command: PruneAuditEventsCommand,
  ): Promise<Result<AuditEventPruneResult>> {
    try {
      const result = await this.auditEventRetentionStore.prune(toRepositoryContext(context), {
        before: command.before,
        dryRun: command.dryRun,
        ...(command.aggregateId ? { aggregateId: command.aggregateId } : {}),
        ...(command.eventType ? { eventType: command.eventType } : {}),
      });

      if (result.isErr()) {
        return err(result.error);
      }

      return ok({
        schemaVersion: "audit-events.prune/v1",
        before: command.before,
        dryRun: command.dryRun,
        ...(command.aggregateId ? { aggregateId: command.aggregateId } : {}),
        ...(command.eventType ? { eventType: command.eventType } : {}),
        matchedCount: result.value.matchedCount,
        prunedCount: result.value.prunedCount,
        heldCount: result.value.heldCount,
        archiveRetainedCount: result.value.archiveRetainedCount,
        countsByEventType: result.value.countsByEventType,
        heldCountsByEventType: result.value.heldCountsByEventType,
        archiveRetainedCountsByEventType: result.value.archiveRetainedCountsByEventType,
        activeHoldIds: result.value.activeHoldIds,
        activeArchiveIds: result.value.activeArchiveIds,
        prunedAt: this.clock.now(),
      });
    } catch (error) {
      return err(
        domainError.infra("Audit event retention prune could not be completed", {
          commandName: "audit-events.prune",
          phase: "audit-event-retention",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }
}
