import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type AuditEventLegalHoldResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ReleaseAuditEventLegalHoldCommandInput,
  releaseAuditEventLegalHoldCommandInputSchema,
} from "./audit-events.schema";

export {
  type ReleaseAuditEventLegalHoldCommandInput,
  releaseAuditEventLegalHoldCommandInputSchema,
} from "./audit-events.schema";

export class ReleaseAuditEventLegalHoldCommand extends Command<AuditEventLegalHoldResult> {
  constructor(
    public readonly holdId: string,
    public readonly releaseReason: string,
    public readonly releasedBy?: string,
  ) {
    super();
  }

  static create(
    input: ReleaseAuditEventLegalHoldCommandInput,
  ): Result<ReleaseAuditEventLegalHoldCommand> {
    return parseOperationInput(releaseAuditEventLegalHoldCommandInputSchema, input).map(
      (parsed) =>
        new ReleaseAuditEventLegalHoldCommand(
          parsed.holdId,
          parsed.releaseReason,
          trimToUndefined(parsed.releasedBy),
        ),
    );
  }
}
