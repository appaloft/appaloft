import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type AuditEventListResult, type AuditEventReadModel, type Clock } from "../../ports";
import { tokens } from "../../tokens";
import { type ListAuditEventsQuery } from "./list-audit-events.query";

@injectable()
export class ListAuditEventsQueryService {
  constructor(
    @inject(tokens.auditEventReadModel)
    private readonly auditEventReadModel: AuditEventReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ListAuditEventsQuery,
  ): Promise<Result<AuditEventListResult>> {
    if (!query.aggregateId) {
      return err(
        domainError.auditEventScopeRequired("Audit event list requires aggregate scope", {
          phase: "audit-event-read",
          requiredScopeKind: "aggregate",
        }),
      );
    }

    const page = await this.auditEventReadModel.list(toRepositoryContext(context), {
      aggregateId: query.aggregateId,
      ...(query.eventType ? { eventType: query.eventType } : {}),
      ...(query.limit ? { limit: query.limit } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });

    return ok({
      schemaVersion: "audit-events.list/v1",
      ...page,
      generatedAt: this.clock.now(),
    });
  }
}
