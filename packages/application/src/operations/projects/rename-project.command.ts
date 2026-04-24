import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type RenameProjectCommandInput,
  renameProjectCommandInputSchema,
} from "./rename-project.schema";

export {
  type RenameProjectCommandInput,
  renameProjectCommandInputSchema,
} from "./rename-project.schema";

export class RenameProjectCommand extends Command<{ id: string }> {
  constructor(
    public readonly projectId: string,
    public readonly name: string,
  ) {
    super();
  }

  static create(input: RenameProjectCommandInput): Result<RenameProjectCommand> {
    return parseOperationInput(renameProjectCommandInputSchema, input).map(
      (parsed) => new RenameProjectCommand(parsed.projectId, parsed.name),
    );
  }
}
