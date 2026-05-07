import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ProvisionRedisDependencyResourceCommandInput,
  provisionRedisDependencyResourceCommandInputSchema,
} from "./provision-redis-dependency-resource.schema";

export {
  type ProvisionRedisDependencyResourceCommandInput,
  provisionRedisDependencyResourceCommandInputSchema,
};

export class ProvisionRedisDependencyResourceCommand extends Command<{ id: string }> {
  constructor(
    public readonly projectId: string,
    public readonly environmentId: string,
    public readonly name: string,
    public readonly providerKey?: string,
    public readonly description?: string,
    public readonly backupRelationship?: ProvisionRedisDependencyResourceCommandInput["backupRelationship"],
  ) {
    super();
  }

  static create(
    input: ProvisionRedisDependencyResourceCommandInput,
  ): Result<ProvisionRedisDependencyResourceCommand> {
    return parseOperationInput(provisionRedisDependencyResourceCommandInputSchema, input).map(
      (parsed) =>
        new ProvisionRedisDependencyResourceCommand(
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
