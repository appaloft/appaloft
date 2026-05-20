import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type UsageIntentRecordResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import { type RecordUsageIntentInput, recordUsageIntentInputSchema } from "./usage-intent.schema";

export class RecordUsageIntentCommand extends Command<RecordUsageIntentResponse> {
  constructor(readonly input: RecordUsageIntentInput) {
    super();
  }

  static create(input: RecordUsageIntentInput): Result<RecordUsageIntentCommand> {
    return parseOperationInput(recordUsageIntentInputSchema, input).map(
      (parsed) => new RecordUsageIntentCommand(parsed),
    );
  }
}

export type RecordUsageIntentResponse = {
  result: UsageIntentRecordResult;
};

export { type RecordUsageIntentInput, recordUsageIntentInputSchema } from "./usage-intent.schema";
