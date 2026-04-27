import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type RenameEnvironmentCommandInput,
  renameEnvironmentCommandInputSchema,
} from "./rename-environment.schema";

export {
  type RenameEnvironmentCommandInput,
  renameEnvironmentCommandInputSchema,
} from "./rename-environment.schema";

export class RenameEnvironmentCommand extends Command<{ id: string }> {
  constructor(
    public readonly environmentId: string,
    public readonly name: string,
  ) {
    super();
  }

  static create(input: RenameEnvironmentCommandInput): Result<RenameEnvironmentCommand> {
    return parseOperationInput(renameEnvironmentCommandInputSchema, input).map(
      (parsed) => new RenameEnvironmentCommand(parsed.environmentId, parsed.name),
    );
  }
}
