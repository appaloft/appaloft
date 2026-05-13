import { err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AuditEventArchiveListResult,
  type AuditEventArchiveStore,
  type Clock,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ListAuditEventArchivesQuery } from "./list-audit-event-archives.query";

@injectable()
export class ListAuditEventArchivesQueryService {
  constructor(
    @inject(tokens.auditEventArchiveStore)
    private readonly archiveStore: AuditEventArchiveStore,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ListAuditEventArchivesQuery,
  ): Promise<Result<AuditEventArchiveListResult>> {
    const page = await this.archiveStore.list(toRepositoryContext(context), {
      ...(query.aggregateId ? { aggregateId: query.aggregateId } : {}),
      ...(query.eventType ? { eventType: query.eventType } : {}),
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });

    if (page.isErr()) {
      return err(page.error);
    }

    return ok({
      schemaVersion: "audit-events.archives.list/v1",
      ...page.value,
      generatedAt: this.clock.now(),
    });
  }
}
