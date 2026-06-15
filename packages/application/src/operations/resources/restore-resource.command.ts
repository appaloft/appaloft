import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type RestoreResourceCommandInput,
  restoreResourceCommandInputSchema,
} from "./restore-resource.schema";

export {
  type RestoreResourceCommandInput,
  restoreResourceCommandInputSchema,
} from "./restore-resource.schema";

export class RestoreResourceCommand extends Command<{ id: string }> {
  constructor(public readonly resourceId: string) {
    super();
  }

  static create(input: RestoreResourceCommandInput): Result<RestoreResourceCommand> {
    return parseOperationInput(restoreResourceCommandInputSchema, input).map(
      (parsed) => new RestoreResourceCommand(parsed.resourceId),
    );
  }
}
