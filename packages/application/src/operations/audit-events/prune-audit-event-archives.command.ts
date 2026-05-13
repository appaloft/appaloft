import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type AuditEventArchivePruneResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import { pruneAuditEventArchivesCommandInputSchema } from "./audit-events.schema";

export {
  type PruneAuditEventArchivesCommandInput,
  pruneAuditEventArchivesCommandInputSchema,
} from "./audit-events.schema";

export class PruneAuditEventArchivesCommand extends Command<AuditEventArchivePruneResult> {
  constructor(
    public readonly before: string,
    public readonly dryRun: boolean,
    public readonly aggregateId?: string,
    public readonly eventType?: string,
  ) {
    super();
  }

  static create(input: unknown): Result<PruneAuditEventArchivesCommand> {
    return parseOperationInput(pruneAuditEventArchivesCommandInputSchema, input).map(
      (parsed) =>
        new PruneAuditEventArchivesCommand(
          parsed.before,
          parsed.dryRun,
          trimToUndefined(parsed.aggregateId),
          trimToUndefined(parsed.eventType),
        ),
    );
  }
}
