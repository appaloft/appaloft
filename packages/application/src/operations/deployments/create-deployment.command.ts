import { type Result } from "@yundu/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type CreateDeploymentCommandInput,
  createDeploymentCommandInputSchema,
} from "./create-deployment.schema";

export {
  type CreateDeploymentCommandInput,
  createDeploymentCommandInputSchema,
} from "./create-deployment.schema";

export class CreateDeploymentCommand extends Command<{ id: string }> {
  constructor(
    public readonly projectId: string,
    public readonly serverId: string,
    public readonly environmentId: string,
    public readonly resourceId: string,
    public readonly destinationId?: string,
  ) {
    super();
  }

  static create(input: CreateDeploymentCommandInput): Result<CreateDeploymentCommand> {
    return parseOperationInput(createDeploymentCommandInputSchema, input).map(
      (parsed) =>
        new CreateDeploymentCommand(
          parsed.projectId,
          parsed.serverId,
          parsed.environmentId,
          parsed.resourceId,
          parsed.destinationId,
        ),
    );
  }
}
