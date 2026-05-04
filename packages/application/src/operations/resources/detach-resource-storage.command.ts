import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type DetachResourceStorageCommandInput,
  detachResourceStorageCommandInputSchema,
} from "./detach-resource-storage.schema";

export {
  type DetachResourceStorageCommandInput,
  detachResourceStorageCommandInputSchema,
} from "./detach-resource-storage.schema";

export class DetachResourceStorageCommand extends Command<{ id: string }> {
  constructor(
    public readonly resourceId: string,
    public readonly attachmentId: string,
  ) {
    super();
  }

  static create(input: DetachResourceStorageCommandInput): Result<DetachResourceStorageCommand> {
    return parseOperationInput(detachResourceStorageCommandInputSchema, input).map(
      (parsed) => new DetachResourceStorageCommand(parsed.resourceId, parsed.attachmentId),
    );
  }
}
