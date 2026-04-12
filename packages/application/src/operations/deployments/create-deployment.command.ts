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
    public readonly configFilePath: string | undefined,
    public readonly projectId: string | undefined,
    public readonly serverId: string | undefined,
    public readonly environmentId: string | undefined,
    public readonly sourceLocator: string,
    public readonly deploymentMethod: CreateDeploymentCommandInput["deploymentMethod"],
    public readonly installCommand?: string,
    public readonly buildCommand?: string,
    public readonly startCommand?: string,
    public readonly port?: number,
    public readonly healthCheckPath?: string,
  ) {
    super();
  }

  static create(input: CreateDeploymentCommandInput): Result<CreateDeploymentCommand> {
    return parseOperationInput(createDeploymentCommandInputSchema, input).map(
      (parsed) =>
        new CreateDeploymentCommand(
          parsed.configFilePath,
          parsed.projectId,
          parsed.serverId,
          parsed.environmentId,
          parsed.sourceLocator,
          parsed.deploymentMethod,
          parsed.installCommand,
          parsed.buildCommand,
          parsed.startCommand,
          parsed.port,
          parsed.healthCheckPath,
        ),
    );
  }
}
