import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AuditEventLegalHoldResult,
  type AuditEventLegalHoldStore,
  type Clock,
  type IdGenerator,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ConfigureAuditEventLegalHoldCommand } from "./configure-audit-event-legal-hold.command";

@injectable()
export class ConfigureAuditEventLegalHoldUseCase {
  constructor(
    @inject(tokens.auditEventLegalHoldStore)
    private readonly legalHoldStore: AuditEventLegalHoldStore,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    command: ConfigureAuditEventLegalHoldCommand,
  ): Promise<Result<AuditEventLegalHoldResult>> {
    if (!command.aggregateId && (!command.from || !command.to)) {
      return err(
        domainError.auditEventLegalHoldScopeRequired(
          "Audit event legal hold requires aggregate id or bounded global window",
          {
            phase: "audit-event-legal-hold",
          },
        ),
      );
    }

    const persisted = await this.legalHoldStore.configure(toRepositoryContext(context), {
      holdId: this.idGenerator.next("ahl"),
      reason: command.reason,
      ...(command.aggregateId ? { aggregateId: command.aggregateId } : {}),
      ...(command.eventType ? { eventType: command.eventType } : {}),
      ...(command.from ? { from: command.from } : {}),
      ...(command.to ? { to: command.to } : {}),
      ...(command.requestedBy ? { requestedBy: command.requestedBy } : {}),
      createdAt: this.clock.now(),
    });

    if (persisted.isErr()) {
      return err(persisted.error);
    }

    return ok({
      schemaVersion: "audit-events.legal-holds.hold/v1",
      hold: persisted.value,
    });
  }
}
