import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type RenameDependencyResourceCommandInput,
  renameDependencyResourceCommandInputSchema,
} from "./rename-dependency-resource.schema";

export { type RenameDependencyResourceCommandInput, renameDependencyResourceCommandInputSchema };

export class RenameDependencyResourceCommand extends Command<{ id: string }> {
  constructor(
    public readonly dependencyResourceId: string,
    public readonly name: string,
  ) {
    super();
  }

  static create(
    input: RenameDependencyResourceCommandInput,
  ): Result<RenameDependencyResourceCommand> {
    return parseOperationInput(renameDependencyResourceCommandInputSchema, input).map(
      (parsed) => new RenameDependencyResourceCommand(parsed.dependencyResourceId, parsed.name),
    );
  }
}
