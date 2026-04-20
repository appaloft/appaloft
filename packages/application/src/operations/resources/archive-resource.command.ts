import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ArchiveResourceCommandInput,
  type ArchiveResourceCommandPayload,
  archiveResourceCommandInputSchema,
} from "./archive-resource.schema";

export {
  type ArchiveResourceCommandInput,
  archiveResourceCommandInputSchema,
} from "./archive-resource.schema";

export class ArchiveResourceCommand extends Command<{ id: string }> {
  constructor(
    public readonly resourceId: string,
    public readonly reason?: ArchiveResourceCommandPayload["reason"],
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(input: ArchiveResourceCommandInput): Result<ArchiveResourceCommand> {
    return parseOperationInput(archiveResourceCommandInputSchema, input).map(
      (parsed) =>
        new ArchiveResourceCommand(
          parsed.resourceId,
          trimToUndefined(parsed.reason),
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
