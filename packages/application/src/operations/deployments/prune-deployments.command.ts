import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type DeploymentAttemptPruneResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type PruneDeploymentsCommandInput,
  type PruneDeploymentsCommandPayload,
  pruneDeploymentsCommandInputSchema,
} from "./prune-deployments.schema";

export {
  type PruneDeploymentsCommandInput,
  pruneDeploymentsCommandInputSchema,
  pruneDeploymentsResponseSchema,
} from "./prune-deployments.schema";

export class PruneDeploymentsCommand extends Command<DeploymentAttemptPruneResult> {
  constructor(
    public readonly before: string,
    public readonly dryRun: boolean,
    public readonly deploymentId?: string,
    public readonly resourceId?: string,
    public readonly serverId?: string,
  ) {
    super();
  }

  static create(input: PruneDeploymentsCommandInput): Result<PruneDeploymentsCommand> {
    return parseOperationInput(pruneDeploymentsCommandInputSchema, input).map(
      (parsed: PruneDeploymentsCommandPayload) =>
        new PruneDeploymentsCommand(
          parsed.before,
          parsed.dryRun,
          trimToUndefined(parsed.deploymentId),
          trimToUndefined(parsed.resourceId),
          trimToUndefined(parsed.serverId),
        ),
    );
  }
}
