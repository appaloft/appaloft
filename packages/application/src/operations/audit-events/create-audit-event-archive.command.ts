import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type AuditEventArchiveResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type CreateAuditEventArchiveCommandInput,
  createAuditEventArchiveCommandInputSchema,
} from "./audit-events.schema";

export {
  type CreateAuditEventArchiveCommandInput,
  createAuditEventArchiveCommandInputSchema,
} from "./audit-events.schema";

export class CreateAuditEventArchiveCommand extends Command<AuditEventArchiveResult> {
  constructor(
    public readonly reason: string,
    public readonly limit: number,
    public readonly retainSourceRows: boolean,
    public readonly aggregateId?: string,
    public readonly eventType?: string,
    public readonly from?: string,
    public readonly to?: string,
  ) {
    super();
  }

  static create(
    input: CreateAuditEventArchiveCommandInput,
  ): Result<CreateAuditEventArchiveCommand> {
    return parseOperationInput(createAuditEventArchiveCommandInputSchema, input).map(
      (parsed) =>
        new CreateAuditEventArchiveCommand(
          parsed.reason,
          parsed.limit,
          parsed.retainSourceRows,
          trimToUndefined(parsed.aggregateId),
          trimToUndefined(parsed.eventType),
          parsed.from,
          parsed.to,
        ),
    );
  }
}
