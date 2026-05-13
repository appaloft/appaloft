import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AuditEventLegalHoldResult,
  type AuditEventLegalHoldStore,
  type Clock,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ReleaseAuditEventLegalHoldCommand } from "./release-audit-event-legal-hold.command";

@injectable()
export class ReleaseAuditEventLegalHoldUseCase {
  constructor(
    @inject(tokens.auditEventLegalHoldStore)
    private readonly legalHoldStore: AuditEventLegalHoldStore,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    command: ReleaseAuditEventLegalHoldCommand,
  ): Promise<Result<AuditEventLegalHoldResult>> {
    const released = await this.legalHoldStore.release(toRepositoryContext(context), {
      holdId: command.holdId,
      releaseReason: command.releaseReason,
      ...(command.releasedBy ? { releasedBy: command.releasedBy } : {}),
      releasedAt: this.clock.now(),
    });

    if (released.isErr()) {
      return err(released.error);
    }

    if (!released.value) {
      return err(
        domainError.auditEventLegalHoldNotFound("Audit event legal hold was not found", {
          phase: "audit-event-legal-hold",
          holdId: command.holdId,
        }),
      );
    }

    return ok({
      schemaVersion: "audit-events.legal-holds.hold/v1",
      hold: released.value,
    });
  }
}
