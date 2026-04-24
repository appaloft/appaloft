import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ArchiveProjectCommandInput,
  type ArchiveProjectCommandPayload,
  archiveProjectCommandInputSchema,
} from "./archive-project.schema";

export {
  type ArchiveProjectCommandInput,
  archiveProjectCommandInputSchema,
} from "./archive-project.schema";

export class ArchiveProjectCommand extends Command<{ id: string }> {
  constructor(
    public readonly projectId: string,
    public readonly reason?: ArchiveProjectCommandPayload["reason"],
  ) {
    super();
  }

  static create(input: ArchiveProjectCommandInput): Result<ArchiveProjectCommand> {
    return parseOperationInput(archiveProjectCommandInputSchema, input).map(
      (parsed) => new ArchiveProjectCommand(parsed.projectId, trimToUndefined(parsed.reason)),
    );
  }
}
