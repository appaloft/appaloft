import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type CompleteSourceEventCheckResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type CompleteSourceEventCheckCommandInput,
  type CompleteSourceEventCheckCommandPayload,
  completeSourceEventCheckCommandInputSchema,
} from "./complete-source-event-check.schema";

export {
  type CompleteSourceEventCheckCommandInput,
  type CompleteSourceEventCheckCommandPayload,
  completeSourceEventCheckCommandInputSchema,
} from "./complete-source-event-check.schema";

export class CompleteSourceEventCheckCommand extends Command<CompleteSourceEventCheckResult> {
  constructor(public readonly payload: CompleteSourceEventCheckCommandPayload) {
    super();
  }

  static create(
    input: CompleteSourceEventCheckCommandInput,
  ): Result<CompleteSourceEventCheckCommand> {
    return parseOperationInput(completeSourceEventCheckCommandInputSchema, input).map(
      (parsed) => new CompleteSourceEventCheckCommand(parsed),
    );
  }
}
