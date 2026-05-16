import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type ReplaySourceEventResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ReplaySourceEventCommandInput,
  replaySourceEventCommandInputSchema,
} from "./replay-source-event.schema";

export { type ReplaySourceEventCommandInput, replaySourceEventCommandInputSchema };

export class ReplaySourceEventCommand extends Command<ReplaySourceEventResult> {
  constructor(
    public readonly sourceEventId: string,
    public readonly projectId?: string,
    public readonly resourceId?: string,
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(input: ReplaySourceEventCommandInput): Result<ReplaySourceEventCommand> {
    return parseOperationInput(replaySourceEventCommandInputSchema, input).map(
      (parsed) =>
        new ReplaySourceEventCommand(
          parsed.sourceEventId,
          trimToUndefined(parsed.projectId),
          trimToUndefined(parsed.resourceId),
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
