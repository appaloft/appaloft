import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type ResourceRuntimeLogArchivePruneResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type PruneResourceRuntimeLogArchivesCommandInput,
  pruneResourceRuntimeLogArchivesCommandInputSchema,
} from "./resource-runtime-log-archives.schema";

export {
  type PruneResourceRuntimeLogArchivesCommandInput,
  pruneResourceRuntimeLogArchivesCommandInputSchema,
} from "./resource-runtime-log-archives.schema";

export class PruneResourceRuntimeLogArchivesCommand extends Command<ResourceRuntimeLogArchivePruneResult> {
  constructor(
    public readonly before: string,
    public readonly dryRun: boolean,
    public readonly resourceId?: string,
    public readonly deploymentId?: string,
    public readonly serverId?: string,
    public readonly serviceName?: string,
  ) {
    super();
  }

  static create(
    input: PruneResourceRuntimeLogArchivesCommandInput,
  ): Result<PruneResourceRuntimeLogArchivesCommand> {
    return parseOperationInput(pruneResourceRuntimeLogArchivesCommandInputSchema, input).map(
      (parsed) =>
        new PruneResourceRuntimeLogArchivesCommand(
          parsed.before,
          parsed.dryRun,
          trimToUndefined(parsed.resourceId),
          trimToUndefined(parsed.deploymentId),
          trimToUndefined(parsed.serverId),
          trimToUndefined(parsed.serviceName),
        ),
    );
  }
}
