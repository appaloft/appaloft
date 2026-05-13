import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type DeploymentLogPruneResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import { pruneDeploymentLogsCommandInputSchema } from "./deployment-log-retention.schema";

export {
  type PruneDeploymentLogsCommandInput,
  pruneDeploymentLogsCommandInputSchema,
} from "./deployment-log-retention.schema";

export class PruneDeploymentLogsCommand extends Command<DeploymentLogPruneResult> {
  constructor(
    public readonly before: string,
    public readonly dryRun: boolean,
    public readonly deploymentId?: string,
    public readonly resourceId?: string,
    public readonly serverId?: string,
  ) {
    super();
  }

  static create(input: unknown): Result<PruneDeploymentLogsCommand> {
    return parseOperationInput(pruneDeploymentLogsCommandInputSchema, input).map(
      (parsed) =>
        new PruneDeploymentLogsCommand(
          parsed.before,
          parsed.dryRun,
          trimToUndefined(parsed.deploymentId),
          trimToUndefined(parsed.resourceId),
          trimToUndefined(parsed.serverId),
        ),
    );
  }
}
