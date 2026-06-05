import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type ResourceRuntimeControlAttemptPruneResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type PruneResourceRuntimeControlAttemptsCommandInput,
  pruneResourceRuntimeControlAttemptsCommandInputSchema,
} from "./resource-runtime-control-attempt-retention.schema";

export {
  type PruneResourceRuntimeControlAttemptsCommandInput,
  pruneResourceRuntimeControlAttemptsCommandInputSchema,
  pruneResourceRuntimeControlAttemptsResponseSchema,
} from "./resource-runtime-control-attempt-retention.schema";

export class PruneResourceRuntimeControlAttemptsCommand extends Command<ResourceRuntimeControlAttemptPruneResult> {
  constructor(
    public readonly before: string,
    public readonly dryRun: boolean,
    public readonly deploymentId?: string,
    public readonly resourceId?: string,
    public readonly serverId?: string,
  ) {
    super();
  }

  static create(
    input: PruneResourceRuntimeControlAttemptsCommandInput,
  ): Result<PruneResourceRuntimeControlAttemptsCommand> {
    return parseOperationInput(pruneResourceRuntimeControlAttemptsCommandInputSchema, input).map(
      (parsed) =>
        new PruneResourceRuntimeControlAttemptsCommand(
          parsed.before,
          parsed.dryRun,
          trimToUndefined(parsed.deploymentId),
          trimToUndefined(parsed.resourceId),
          trimToUndefined(parsed.serverId),
        ),
    );
  }
}
