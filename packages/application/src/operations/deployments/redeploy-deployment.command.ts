import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type RedeployDeploymentCommandInput,
  redeployDeploymentCommandInputSchema,
} from "./redeploy-deployment.schema";

export {
  type RedeployDeploymentCommandInput,
  redeployDeploymentCommandInputSchema,
} from "./redeploy-deployment.schema";

export class RedeployDeploymentCommand extends Command<{ id: string }> {
  constructor(
    public readonly resourceId: string,
    public readonly projectId: string | undefined,
    public readonly environmentId: string | undefined,
    public readonly serverId: string | undefined,
    public readonly destinationId: string | undefined,
    public readonly sourceDeploymentId: string | undefined,
    public readonly readinessGeneratedAt: string | undefined,
  ) {
    super();
  }

  static create(input: RedeployDeploymentCommandInput): Result<RedeployDeploymentCommand> {
    return parseOperationInput(redeployDeploymentCommandInputSchema, input).map(
      (parsed) =>
        new RedeployDeploymentCommand(
          parsed.resourceId,
          parsed.projectId,
          parsed.environmentId,
          parsed.serverId,
          parsed.destinationId,
          parsed.sourceDeploymentId,
          parsed.readinessGeneratedAt,
        ),
    );
  }
}
