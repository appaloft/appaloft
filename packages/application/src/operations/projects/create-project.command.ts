import { type Result } from "@yundu/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type CreateProjectCommandInput,
  createProjectCommandInputSchema,
} from "./create-project.schema";

export {
  type CreateProjectCommandInput,
  createProjectCommandInputSchema,
} from "./create-project.schema";

export class CreateProjectCommand extends Command<{ id: string }> {
  constructor(
    public readonly name: string,
    public readonly description?: string,
  ) {
    super();
  }

  static create(input: CreateProjectCommandInput): Result<CreateProjectCommand> {
    return parseOperationInput(createProjectCommandInputSchema, input).map(
      (parsed) => new CreateProjectCommand(parsed.name, trimToUndefined(parsed.description)),
    );
  }
}
