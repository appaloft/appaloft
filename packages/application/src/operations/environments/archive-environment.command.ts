import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ArchiveEnvironmentCommandInput,
  type ArchiveEnvironmentCommandPayload,
  archiveEnvironmentCommandInputSchema,
} from "./archive-environment.schema";

export {
  type ArchiveEnvironmentCommandInput,
  archiveEnvironmentCommandInputSchema,
} from "./archive-environment.schema";

export class ArchiveEnvironmentCommand extends Command<{ id: string }> {
  constructor(
    public readonly environmentId: string,
    public readonly reason?: ArchiveEnvironmentCommandPayload["reason"],
  ) {
    super();
  }

  static create(input: ArchiveEnvironmentCommandInput): Result<ArchiveEnvironmentCommand> {
    return parseOperationInput(archiveEnvironmentCommandInputSchema, input).map(
      (parsed) =>
        new ArchiveEnvironmentCommand(parsed.environmentId, trimToUndefined(parsed.reason)),
    );
  }
}
