import {
  type DeploymentLogSource,
  type DeploymentStatus,
  type LogLevel,
  type Result,
} from "@yundu/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ReattachDeploymentCommandInput,
  reattachDeploymentCommandInputSchema,
} from "./reattach-deployment.schema";

export {
  type ReattachDeploymentCommandInput,
  reattachDeploymentCommandInputSchema,
} from "./reattach-deployment.schema";

export interface ReattachDeploymentResult {
  id: string;
  status: DeploymentStatus;
  logs: Array<{
    timestamp: string;
    source: DeploymentLogSource;
    phase: "detect" | "plan" | "package" | "deploy" | "verify" | "rollback";
    level: LogLevel;
    message: string;
  }>;
}

export class ReattachDeploymentCommand extends Command<ReattachDeploymentResult> {
  constructor(public readonly deploymentId: string) {
    super();
  }

  static create(input: ReattachDeploymentCommandInput): Result<ReattachDeploymentCommand> {
    return parseOperationInput(reattachDeploymentCommandInputSchema, input).map(
      (parsed) => new ReattachDeploymentCommand(parsed.deploymentId),
    );
  }
}
