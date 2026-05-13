import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type AuditEventLegalHoldResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ConfigureAuditEventLegalHoldCommandInput,
  configureAuditEventLegalHoldCommandInputSchema,
} from "./audit-events.schema";

export {
  type ConfigureAuditEventLegalHoldCommandInput,
  configureAuditEventLegalHoldCommandInputSchema,
} from "./audit-events.schema";

export class ConfigureAuditEventLegalHoldCommand extends Command<AuditEventLegalHoldResult> {
  constructor(
    public readonly reason: string,
    public readonly aggregateId?: string,
    public readonly eventType?: string,
    public readonly from?: string,
    public readonly to?: string,
    public readonly requestedBy?: string,
  ) {
    super();
  }

  static create(
    input: ConfigureAuditEventLegalHoldCommandInput,
  ): Result<ConfigureAuditEventLegalHoldCommand> {
    return parseOperationInput(configureAuditEventLegalHoldCommandInputSchema, input).map(
      (parsed) =>
        new ConfigureAuditEventLegalHoldCommand(
          parsed.reason,
          trimToUndefined(parsed.aggregateId),
          trimToUndefined(parsed.eventType),
          parsed.from,
          parsed.to,
          trimToUndefined(parsed.requestedBy),
        ),
    );
  }
}
