import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type CreateDependencyResourceBackupCommandInput,
  createDependencyResourceBackupCommandInputSchema,
} from "./create-dependency-resource-backup.schema";

export {
  type CreateDependencyResourceBackupCommandInput,
  createDependencyResourceBackupCommandInputSchema,
};

export class CreateDependencyResourceBackupCommand extends Command<{ id: string }> {
  constructor(
    public readonly dependencyResourceId: string,
    public readonly description?: string,
    public readonly providerKey?: string,
  ) {
    super();
  }

  static create(
    input: CreateDependencyResourceBackupCommandInput,
  ): Result<CreateDependencyResourceBackupCommand> {
    return parseOperationInput(createDependencyResourceBackupCommandInputSchema, input).map(
      (parsed) =>
        new CreateDependencyResourceBackupCommand(
          parsed.dependencyResourceId,
          parsed.description,
          parsed.providerKey,
        ),
    );
  }
}
