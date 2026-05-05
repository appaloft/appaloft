import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type RetryDeploymentCommandInput,
  retryDeploymentCommandInputSchema,
} from "./retry-deployment.schema";

export {
  type RetryDeploymentCommandInput,
  retryDeploymentCommandInputSchema,
} from "./retry-deployment.schema";

export class RetryDeploymentCommand extends Command<{ id: string }> {
  constructor(
    public readonly deploymentId: string,
    public readonly resourceId: string | undefined,
    public readonly readinessGeneratedAt: string | undefined,
  ) {
    super();
  }

  static create(input: RetryDeploymentCommandInput): Result<RetryDeploymentCommand> {
    return parseOperationInput(retryDeploymentCommandInputSchema, input).map(
      (parsed) =>
        new RetryDeploymentCommand(
          parsed.deploymentId,
          parsed.resourceId,
          parsed.readinessGeneratedAt,
        ),
    );
  }
}
