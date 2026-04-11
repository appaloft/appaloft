import { type Result } from "@yundu/core";

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
  constructor(public readonly deploymentId: string) {
    super();
  }

  static create(input: RollbackDeploymentCommandInput): Result<RollbackDeploymentCommand> {
    return parseOperationInput(rollbackDeploymentCommandInputSchema, input).map(
      (parsed) => new RollbackDeploymentCommand(parsed.deploymentId),
    );
  }
}
