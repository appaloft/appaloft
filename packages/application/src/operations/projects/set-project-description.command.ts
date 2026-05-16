import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type SetProjectDescriptionCommandInput,
  setProjectDescriptionCommandInputSchema,
} from "./set-project-description.schema";

export {
  type SetProjectDescriptionCommandInput,
  setProjectDescriptionCommandInputSchema,
} from "./set-project-description.schema";

export class SetProjectDescriptionCommand extends Command<{ id: string }> {
  constructor(
    public readonly projectId: string,
    public readonly description?: string,
  ) {
    super();
  }

  static create(input: SetProjectDescriptionCommandInput): Result<SetProjectDescriptionCommand> {
    return parseOperationInput(setProjectDescriptionCommandInputSchema, input).map(
      (parsed) => new SetProjectDescriptionCommand(parsed.projectId, parsed.description),
    );
  }
}
