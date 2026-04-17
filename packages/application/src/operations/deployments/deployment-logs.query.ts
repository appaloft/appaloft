import { type Result } from "@appaloft/core";
import { Query } from "../../cqrs";
import { type DeploymentLogSummary } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type DeploymentLogsQueryInput,
  deploymentLogsQueryInputSchema,
} from "./deployment-logs.schema";

export {
  type DeploymentLogsQueryInput,
  deploymentLogsQueryInputSchema,
} from "./deployment-logs.schema";

export class DeploymentLogsQuery extends Query<{
  deploymentId: string;
  logs: DeploymentLogSummary[];
}> {
  constructor(public readonly deploymentId: string) {
    super();
  }

  static create(input: DeploymentLogsQueryInput): Result<DeploymentLogsQuery> {
    return parseOperationInput(deploymentLogsQueryInputSchema, input).map(
      (parsed) => new DeploymentLogsQuery(parsed.deploymentId),
    );
  }
}
