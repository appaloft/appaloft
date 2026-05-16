import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type CancelDeploymentCommandInput,
  type CancelDeploymentCommandPayload,
  cancelDeploymentCommandInputSchema,
} from "./cancel-deployment.schema";

export {
  type CancelDeploymentCommandInput,
  cancelDeploymentCommandInputSchema,
} from "./cancel-deployment.schema";

export class CancelDeploymentCommand extends Command<{
  id: string;
  status: "canceled";
  canceledAt: string;
}> {
  constructor(
    public readonly deploymentId: string,
    public readonly confirm: string,
    public readonly resourceId: string | undefined,
  ) {
    super();
  }

  static create(input: CancelDeploymentCommandInput): Result<CancelDeploymentCommand> {
    return parseOperationInput(cancelDeploymentCommandInputSchema, input).map(
      (parsed: CancelDeploymentCommandPayload) =>
        new CancelDeploymentCommand(parsed.deploymentId, parsed.confirm, parsed.resourceId),
    );
  }
}
