import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type ConnectionCallbackResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type CompleteConnectionCallbackCommandInput,
  completeConnectionCallbackCommandInputSchema,
} from "./connections.schema";

export {
  type CompleteConnectionCallbackCommandInput,
  completeConnectionCallbackCommandInputSchema,
} from "./connections.schema";

export class CompleteConnectionCallbackCommand extends Command<ConnectionCallbackResult> {
  constructor(readonly input: CompleteConnectionCallbackCommandInput) {
    super();
  }

  static create(
    input: CompleteConnectionCallbackCommandInput,
  ): Result<CompleteConnectionCallbackCommand> {
    return parseOperationInput(completeConnectionCallbackCommandInputSchema, input).map(
      (parsed) => new CompleteConnectionCallbackCommand(parsed),
    );
  }
}
