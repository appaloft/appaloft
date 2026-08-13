import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type CleanupDeploymentRuntimeCommandInput,
  type CleanupDeploymentRuntimeResponse,
  cleanupDeploymentRuntimeCommandInputSchema,
} from "./cleanup-deployment-runtime.schema";

export {
  type CleanupDeploymentRuntimeCommandInput,
  type CleanupDeploymentRuntimeResponse,
  cleanupDeploymentRuntimeCommandInputSchema,
  cleanupDeploymentRuntimeResponseSchema,
} from "./cleanup-deployment-runtime.schema";

export class CleanupDeploymentRuntimeCommand extends Command<CleanupDeploymentRuntimeResponse> {
  constructor(
    public readonly deploymentId: string,
    public readonly confirm: string,
    public readonly resourceId?: string,
  ) {
    super();
  }

  static create(
    input: CleanupDeploymentRuntimeCommandInput,
  ): Result<CleanupDeploymentRuntimeCommand> {
    return parseOperationInput(cleanupDeploymentRuntimeCommandInputSchema, input, {
      validationPhase: "command-validation",
    }).map(
      (parsed) =>
        new CleanupDeploymentRuntimeCommand(parsed.deploymentId, parsed.confirm, parsed.resourceId),
    );
  }
}
