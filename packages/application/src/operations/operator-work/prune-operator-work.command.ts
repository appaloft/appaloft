import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type PrunableProcessAttemptStatus } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type PruneOperatorWorkCommandInput,
  type PruneOperatorWorkCommandPayload,
  pruneOperatorWorkCommandInputSchema,
} from "./prune-operator-work.schema";

export {
  type PruneOperatorWorkCommandInput,
  pruneOperatorWorkCommandInputSchema,
} from "./prune-operator-work.schema";

export class PruneOperatorWorkCommand extends Command<{
  prunedCount: number;
  matchedCount: number;
  dryRun: boolean;
  before: string;
  statuses: PrunableProcessAttemptStatus[];
  countsByStatus: Partial<Record<PrunableProcessAttemptStatus, number>>;
  prunedAt: string;
}> {
  constructor(
    public readonly before: string,
    public readonly statuses?: PrunableProcessAttemptStatus[],
    public readonly dryRun?: boolean,
  ) {
    super();
  }

  static create(input: PruneOperatorWorkCommandInput): Result<PruneOperatorWorkCommand> {
    return parseOperationInput(pruneOperatorWorkCommandInputSchema, input).map(
      (parsed: PruneOperatorWorkCommandPayload) =>
        new PruneOperatorWorkCommand(parsed.before, parsed.statuses, parsed.dryRun),
    );
  }
}
