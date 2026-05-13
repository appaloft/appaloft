import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type AuditEventExportResult, type AuditEventReadModel, type Clock } from "../../ports";
import { tokens } from "../../tokens";
import { type ExportAuditEventsQuery } from "./export-audit-events.query";

@injectable()
export class ExportAuditEventsQueryService {
  constructor(
    @inject(tokens.auditEventReadModel)
    private readonly auditEventReadModel: AuditEventReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ExportAuditEventsQuery,
  ): Promise<Result<AuditEventExportResult>> {
    if (!query.aggregateId) {
      return err(
        domainError.auditEventScopeRequired("Audit event export requires aggregate scope", {
          phase: "audit-event-export",
          requiredScopeKind: "aggregate",
        }),
      );
    }

    const page = await this.auditEventReadModel.export(toRepositoryContext(context), {
      aggregateId: query.aggregateId,
      ...(query.eventType ? { eventType: query.eventType } : {}),
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      limit: query.limit,
    });

    return ok({
      schemaVersion: "audit-events.export/v1",
      aggregateId: query.aggregateId,
      filters: {
        ...(query.eventType ? { eventType: query.eventType } : {}),
        ...(query.from ? { from: query.from } : {}),
        ...(query.to ? { to: query.to } : {}),
        limit: query.limit,
      },
      itemCount: page.items.length,
      ...page,
      generatedAt: this.clock.now(),
    });
  }
}
