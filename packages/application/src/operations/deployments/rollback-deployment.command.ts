import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type RollbackDeploymentCommandInput,
  rollbackDeploymentCommandInputSchema,
} from "./rollback-deployment.schema";

export {
  type RollbackDeploymentCommandInput,
  rollbackDeploymentCommandInputSchema,
} from "./rollback-deployment.schema";

export class RollbackDeploymentCommand extends Command<{ id: string }> {
  constructor(
    public readonly deploymentId: string,
    public readonly rollbackCandidateDeploymentId: string,
    public readonly resourceId: string | undefined,
    public readonly readinessGeneratedAt: string | undefined,
  ) {
    super();
  }

  static create(input: RollbackDeploymentCommandInput): Result<RollbackDeploymentCommand> {
    return parseOperationInput(rollbackDeploymentCommandInputSchema, input).map(
      (parsed) =>
        new RollbackDeploymentCommand(
          parsed.deploymentId,
          parsed.rollbackCandidateDeploymentId,
          parsed.resourceId,
          parsed.readinessGeneratedAt,
        ),
    );
  }
}
