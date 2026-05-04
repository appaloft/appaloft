import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ProvisionPostgresDependencyResourceCommandInput,
  provisionPostgresDependencyResourceCommandInputSchema,
} from "./provision-postgres-dependency-resource.schema";

export {
  type ProvisionPostgresDependencyResourceCommandInput,
  provisionPostgresDependencyResourceCommandInputSchema,
};

export class ProvisionPostgresDependencyResourceCommand extends Command<{ id: string }> {
  constructor(
    public readonly projectId: string,
    public readonly environmentId: string,
    public readonly name: string,
    public readonly providerKey?: string,
    public readonly description?: string,
    public readonly backupRelationship?: ProvisionPostgresDependencyResourceCommandInput["backupRelationship"],
  ) {
    super();
  }

  static create(
    input: ProvisionPostgresDependencyResourceCommandInput,
  ): Result<ProvisionPostgresDependencyResourceCommand> {
    return parseOperationInput(provisionPostgresDependencyResourceCommandInputSchema, input).map(
      (parsed) =>
        new ProvisionPostgresDependencyResourceCommand(
          parsed.projectId,
          parsed.environmentId,
          parsed.name,
          parsed.providerKey,
          parsed.description,
          parsed.backupRelationship,
        ),
    );
  }
}
