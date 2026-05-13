import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AuditEventArchivePruneResult,
  type AuditEventArchiveStore,
  type Clock,
} from "../../ports";
import { tokens } from "../../tokens";
import { type PruneAuditEventArchivesCommand } from "./prune-audit-event-archives.command";

@injectable()
export class PruneAuditEventArchivesUseCase {
  constructor(
    @inject(tokens.auditEventArchiveStore)
    private readonly archiveStore: AuditEventArchiveStore,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    command: PruneAuditEventArchivesCommand,
  ): Promise<Result<AuditEventArchivePruneResult>> {
    try {
      const result = await this.archiveStore.prune(toRepositoryContext(context), {
        before: command.before,
        dryRun: command.dryRun,
        ...(command.aggregateId ? { aggregateId: command.aggregateId } : {}),
        ...(command.eventType ? { eventType: command.eventType } : {}),
      });

      if (result.isErr()) {
        return err(result.error);
      }

      return ok({
        schemaVersion: "audit-events.archives.prune/v1",
        before: command.before,
        dryRun: command.dryRun,
        ...(command.aggregateId ? { aggregateId: command.aggregateId } : {}),
        ...(command.eventType ? { eventType: command.eventType } : {}),
        matchedCount: result.value.matchedCount,
        prunedCount: result.value.prunedCount,
        countsBySourceKind: result.value.countsBySourceKind,
        countsByEventType: result.value.countsByEventType,
        prunedAt: this.clock.now(),
      });
    } catch (error) {
      return err(
        domainError.infra("Audit event archive prune could not be completed", {
          commandName: "audit-events.archives.prune",
          phase: "audit-event-archive-prune",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }
}
