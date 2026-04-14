import { type Result } from "@yundu/core";

import { Command } from "../../cqrs";
import { type DeploymentHealthResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type CheckDeploymentHealthCommandInput,
  checkDeploymentHealthCommandInputSchema,
} from "./check-deployment-health.schema";

export {
  type CheckDeploymentHealthCommandInput,
  checkDeploymentHealthCommandInputSchema,
} from "./check-deployment-health.schema";

export class CheckDeploymentHealthCommand extends Command<DeploymentHealthResult> {
  constructor(public readonly deploymentId: string) {
    super();
  }

  static create(input: CheckDeploymentHealthCommandInput): Result<CheckDeploymentHealthCommand> {
    return parseOperationInput(checkDeploymentHealthCommandInputSchema, input).map(
      (parsed) => new CheckDeploymentHealthCommand(parsed.deploymentId),
    );
  }
}
