import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type RestoreProjectCommandInput,
  restoreProjectCommandInputSchema,
} from "./restore-project.schema";

export {
  type RestoreProjectCommandInput,
  restoreProjectCommandInputSchema,
} from "./restore-project.schema";

export class RestoreProjectCommand extends Command<{ id: string }> {
  constructor(public readonly projectId: string) {
    super();
  }

  static create(input: RestoreProjectCommandInput): Result<RestoreProjectCommand> {
    return parseOperationInput(restoreProjectCommandInputSchema, input).map(
      (parsed) => new RestoreProjectCommand(parsed.projectId),
    );
  }
}
