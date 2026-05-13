import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AuditEventLegalHoldShowResult,
  type AuditEventLegalHoldStore,
  type Clock,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ShowAuditEventLegalHoldQuery } from "./show-audit-event-legal-hold.query";

@injectable()
export class ShowAuditEventLegalHoldQueryService {
  constructor(
    @inject(tokens.auditEventLegalHoldStore)
    private readonly legalHoldStore: AuditEventLegalHoldStore,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ShowAuditEventLegalHoldQuery,
  ): Promise<Result<AuditEventLegalHoldShowResult>> {
    const hold = await this.legalHoldStore.findOne(toRepositoryContext(context), query.holdId);

    if (hold.isErr()) {
      return err(hold.error);
    }

    if (!hold.value) {
      return err(
        domainError.auditEventLegalHoldNotFound("Audit event legal hold was not found", {
          phase: "audit-event-legal-hold",
          holdId: query.holdId,
        }),
      );
    }

    return ok({
      schemaVersion: "audit-events.legal-holds.show/v1",
      hold: hold.value,
      generatedAt: this.clock.now(),
    });
  }
}
