import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type ResourceRuntimeLogArchiveResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ArchiveResourceRuntimeLogsCommandInput,
  archiveResourceRuntimeLogsCommandInputSchema,
} from "./resource-runtime-log-archives.schema";

export {
  type ArchiveResourceRuntimeLogsCommandInput,
  archiveResourceRuntimeLogsCommandInputSchema,
} from "./resource-runtime-log-archives.schema";

export class ArchiveResourceRuntimeLogsCommand extends Command<ResourceRuntimeLogArchiveResult> {
  constructor(
    public readonly resourceId: string,
    public readonly tailLines: number,
    public readonly deploymentId?: string,
    public readonly serviceName?: string,
    public readonly since?: string,
    public readonly cursor?: string,
    public readonly reason?: string,
  ) {
    super();
  }

  static create(
    input: ArchiveResourceRuntimeLogsCommandInput,
  ): Result<ArchiveResourceRuntimeLogsCommand> {
    return parseOperationInput(archiveResourceRuntimeLogsCommandInputSchema, input).map(
      (parsed) =>
        new ArchiveResourceRuntimeLogsCommand(
          parsed.resourceId,
          parsed.tailLines,
          trimToUndefined(parsed.deploymentId),
          trimToUndefined(parsed.serviceName),
          trimToUndefined(parsed.since),
          trimToUndefined(parsed.cursor),
          trimToUndefined(parsed.reason),
        ),
    );
  }
}
