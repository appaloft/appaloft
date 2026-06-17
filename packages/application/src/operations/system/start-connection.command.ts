import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type ConnectionStartResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type StartConnectionCommandInput,
  startConnectionCommandInputSchema,
} from "./connections.schema";

export {
  type StartConnectionCommandInput,
  startConnectionCommandInputSchema,
} from "./connections.schema";

export class StartConnectionCommand extends Command<ConnectionStartResult> {
  constructor(readonly input: StartConnectionCommandInput) {
    super();
  }

  static create(input: StartConnectionCommandInput): Result<StartConnectionCommand> {
    return parseOperationInput(startConnectionCommandInputSchema, input).map(
      (parsed) => new StartConnectionCommand(parsed),
    );
  }
}
