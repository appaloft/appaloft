import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type SourceEventPruneResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type PruneSourceEventsCommandInput,
  pruneSourceEventsCommandInputSchema,
} from "./prune-source-events.schema";

export { type PruneSourceEventsCommandInput, pruneSourceEventsCommandInputSchema };

export class PruneSourceEventsCommand extends Command<SourceEventPruneResult> {
  constructor(
    public readonly before: string,
    public readonly dryRun: boolean,
    public readonly projectId?: string,
    public readonly resourceId?: string,
    public readonly status?: PruneSourceEventsCommandInput["status"],
    public readonly sourceKind?: PruneSourceEventsCommandInput["sourceKind"],
  ) {
    super();
  }

  static create(input: unknown): Result<PruneSourceEventsCommand> {
    return parseOperationInput(pruneSourceEventsCommandInputSchema, input).map(
      (parsed) =>
        new PruneSourceEventsCommand(
          parsed.before,
          parsed.dryRun,
          trimToUndefined(parsed.projectId),
          trimToUndefined(parsed.resourceId),
          parsed.status,
          parsed.sourceKind,
        ),
    );
  }
}
