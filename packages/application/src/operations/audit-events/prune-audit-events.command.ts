import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type AuditEventPruneResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import { pruneAuditEventsCommandInputSchema } from "./audit-events.schema";

export {
  type PruneAuditEventsCommandInput,
  pruneAuditEventsCommandInputSchema,
} from "./audit-events.schema";

export class PruneAuditEventsCommand extends Command<AuditEventPruneResult> {
  constructor(
    public readonly before: string,
    public readonly dryRun: boolean,
    public readonly aggregateId?: string,
    public readonly eventType?: string,
  ) {
    super();
  }

  static create(input: unknown): Result<PruneAuditEventsCommand> {
    return parseOperationInput(pruneAuditEventsCommandInputSchema, input).map(
      (parsed) =>
        new PruneAuditEventsCommand(
          parsed.before,
          parsed.dryRun,
          trimToUndefined(parsed.aggregateId),
          trimToUndefined(parsed.eventType),
        ),
    );
  }
}
