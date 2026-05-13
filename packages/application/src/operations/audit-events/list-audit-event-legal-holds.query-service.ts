import { err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AuditEventLegalHoldListResult,
  type AuditEventLegalHoldStore,
  type Clock,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ListAuditEventLegalHoldsQuery } from "./list-audit-event-legal-holds.query";

@injectable()
export class ListAuditEventLegalHoldsQueryService {
  constructor(
    @inject(tokens.auditEventLegalHoldStore)
    private readonly legalHoldStore: AuditEventLegalHoldStore,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ListAuditEventLegalHoldsQuery,
  ): Promise<Result<AuditEventLegalHoldListResult>> {
    const page = await this.legalHoldStore.list(toRepositoryContext(context), {
      ...(query.status ? { status: query.status } : {}),
      ...(query.aggregateId ? { aggregateId: query.aggregateId } : {}),
      ...(query.eventType ? { eventType: query.eventType } : {}),
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });

    if (page.isErr()) {
      return err(page.error);
    }

    return ok({
      schemaVersion: "audit-events.legal-holds.list/v1",
      ...page.value,
      generatedAt: this.clock.now(),
    });
  }
}
