import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type AuditEventReadModel, type AuditEventShowResult } from "../../ports";
import { tokens } from "../../tokens";
import { type ShowAuditEventQuery } from "./show-audit-event.query";

@injectable()
export class ShowAuditEventQueryService {
  constructor(
    @inject(tokens.auditEventReadModel)
    private readonly auditEventReadModel: AuditEventReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ShowAuditEventQuery,
  ): Promise<Result<AuditEventShowResult>> {
    if (!query.aggregateId) {
      return err(
        domainError.auditEventScopeRequired("Audit event detail requires aggregate scope", {
          phase: "audit-event-read",
          auditEventId: query.auditEventId,
          requiredScopeKind: "aggregate",
        }),
      );
    }

    const auditEvent = await this.auditEventReadModel.findOne(toRepositoryContext(context), {
      auditEventId: query.auditEventId,
      aggregateId: query.aggregateId,
    });

    if (!auditEvent) {
      return err(
        domainError.auditEventNotFound("Audit event was not found", {
          phase: "audit-event-read",
          auditEventId: query.auditEventId,
        }),
      );
    }

    return ok({
      schemaVersion: "audit-events.show/v1",
      event: auditEvent,
    });
  }
}
