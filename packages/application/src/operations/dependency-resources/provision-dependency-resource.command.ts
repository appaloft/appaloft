import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type ManagedDependencyResourceKind } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ProvisionDependencyResourceCommandInput,
  provisionDependencyResourceCommandInputSchema,
} from "./provision-dependency-resource.schema";

export {
  type ProvisionDependencyResourceCommandInput,
  provisionDependencyResourceCommandInputSchema,
};

export class ProvisionDependencyResourceCommand extends Command<{ id: string }> {
  constructor(
    public readonly kind: ManagedDependencyResourceKind,
    public readonly projectId: string,
    public readonly environmentId: string,
    public readonly serverId: string | undefined,
    public readonly name: string,
    public readonly providerKey?: string,
    public readonly description?: string,
    public readonly capabilities?: ProvisionDependencyResourceCommandInput["capabilities"],
    public readonly backupRelationship?: ProvisionDependencyResourceCommandInput["backupRelationship"],
  ) {
    super();
  }

  static create(
    input: ProvisionDependencyResourceCommandInput,
  ): Result<ProvisionDependencyResourceCommand> {
    return parseOperationInput(provisionDependencyResourceCommandInputSchema, input).map(
      (parsed) =>
        new ProvisionDependencyResourceCommand(
          parsed.kind,
          parsed.projectId,
          parsed.environmentId,
          parsed.serverId,
          parsed.name,
          parsed.providerKey,
          parsed.description,
          parsed.capabilities,
          parsed.backupRelationship,
        ),
    );
  }
}
