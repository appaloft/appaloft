import { type Result } from "@yundu/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type CancelDeploymentCommandInput,
  cancelDeploymentCommandInputSchema,
} from "./cancel-deployment.schema";

export {
  type CancelDeploymentCommandInput,
  cancelDeploymentCommandInputSchema,
} from "./cancel-deployment.schema";

export class CancelDeploymentCommand extends Command<{ id: string; status: "canceled" }> {
  constructor(
    public readonly deploymentId: string,
    public readonly reason: string | undefined,
  ) {
    super();
  }

  static create(input: CancelDeploymentCommandInput): Result<CancelDeploymentCommand> {
    return parseOperationInput(cancelDeploymentCommandInputSchema, input).map(
      (parsed) => new CancelDeploymentCommand(parsed.deploymentId, parsed.reason),
    );
  }
}
