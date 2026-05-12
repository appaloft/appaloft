import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type ProviderJobLogPruneResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import { pruneProviderJobLogsCommandInputSchema } from "./provider-job-logs.schema";

export {
  type PruneProviderJobLogsCommandInput,
  pruneProviderJobLogsCommandInputSchema,
} from "./provider-job-logs.schema";

export class PruneProviderJobLogsCommand extends Command<ProviderJobLogPruneResult> {
  constructor(
    public readonly before: string,
    public readonly dryRun: boolean,
    public readonly deploymentId?: string,
    public readonly providerKey?: string,
    public readonly resourceId?: string,
    public readonly serverId?: string,
  ) {
    super();
  }

  static create(input: unknown): Result<PruneProviderJobLogsCommand> {
    return parseOperationInput(pruneProviderJobLogsCommandInputSchema, input).map(
      (parsed) =>
        new PruneProviderJobLogsCommand(
          parsed.before,
          parsed.dryRun,
          trimToUndefined(parsed.deploymentId),
          trimToUndefined(parsed.providerKey),
          trimToUndefined(parsed.resourceId),
          trimToUndefined(parsed.serverId),
        ),
    );
  }
}
