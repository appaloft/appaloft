import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type CreateActionSourceLinkDeploymentCommandInput,
  type CreateActionSourceLinkDeploymentResponse,
  createActionSourceLinkDeploymentCommandInputSchema,
} from "./create-action-source-link-deployment.schema";

export {
  type CreateActionSourceLinkDeploymentCommandInput,
  type CreateActionSourceLinkDeploymentResponse,
  createActionSourceLinkDeploymentCommandInputSchema,
  createActionSourceLinkDeploymentResponseSchema,
} from "./create-action-source-link-deployment.schema";

export class CreateActionSourceLinkDeploymentCommand extends Command<CreateActionSourceLinkDeploymentResponse> {
  constructor(
    public readonly sourceFingerprint: string,
    public readonly projectId?: string,
    public readonly environmentId?: string,
    public readonly resourceId?: string,
    public readonly serverId?: string,
    public readonly destinationId?: string,
  ) {
    super();
  }

  static create(
    input: CreateActionSourceLinkDeploymentCommandInput,
  ): Result<CreateActionSourceLinkDeploymentCommand> {
    return parseOperationInput(createActionSourceLinkDeploymentCommandInputSchema, input).map(
      (parsed) =>
        new CreateActionSourceLinkDeploymentCommand(
          parsed.sourceFingerprint,
          parsed.projectId,
          parsed.environmentId,
          parsed.resourceId,
          parsed.serverId,
          parsed.destinationId,
        ),
    );
  }
}
