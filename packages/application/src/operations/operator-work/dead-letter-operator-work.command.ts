import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type DeadLetterOperatorWorkCommandInput,
  type DeadLetterOperatorWorkCommandPayload,
  deadLetterOperatorWorkCommandInputSchema,
} from "./dead-letter-operator-work.schema";

export {
  type DeadLetterOperatorWorkCommandInput,
  deadLetterOperatorWorkCommandInputSchema,
} from "./dead-letter-operator-work.schema";

export class DeadLetterOperatorWorkCommand extends Command<{
  workId: string;
  status: "dead-lettered";
  deadLetteredAt: string;
}> {
  constructor(
    public readonly workId: string,
    public readonly reason: string,
  ) {
    super();
  }

  static create(input: DeadLetterOperatorWorkCommandInput): Result<DeadLetterOperatorWorkCommand> {
    return parseOperationInput(deadLetterOperatorWorkCommandInputSchema, input).map(
      (parsed: DeadLetterOperatorWorkCommandPayload) =>
        new DeadLetterOperatorWorkCommand(parsed.workId, parsed.reason),
    );
  }
}
