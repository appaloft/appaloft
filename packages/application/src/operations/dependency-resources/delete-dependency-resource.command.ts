import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type DeleteDependencyResourceCommandInput,
  deleteDependencyResourceCommandInputSchema,
} from "./delete-dependency-resource.schema";

export { type DeleteDependencyResourceCommandInput, deleteDependencyResourceCommandInputSchema };

export class DeleteDependencyResourceCommand extends Command<{ id: string }> {
  constructor(public readonly dependencyResourceId: string) {
    super();
  }

  static create(
    input: DeleteDependencyResourceCommandInput,
  ): Result<DeleteDependencyResourceCommand> {
    return parseOperationInput(deleteDependencyResourceCommandInputSchema, input).map(
      (parsed) => new DeleteDependencyResourceCommand(parsed.dependencyResourceId),
    );
  }
}
