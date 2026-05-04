import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type AttachResourceStorageCommandInput,
  attachResourceStorageCommandInputSchema,
} from "./attach-resource-storage.schema";

export {
  type AttachResourceStorageCommandInput,
  attachResourceStorageCommandInputSchema,
} from "./attach-resource-storage.schema";

export class AttachResourceStorageCommand extends Command<{ id: string }> {
  constructor(
    public readonly resourceId: string,
    public readonly storageVolumeId: string,
    public readonly destinationPath: string,
    public readonly mountMode: AttachResourceStorageCommandInput["mountMode"],
  ) {
    super();
  }

  static create(input: AttachResourceStorageCommandInput): Result<AttachResourceStorageCommand> {
    return parseOperationInput(attachResourceStorageCommandInputSchema, input).map(
      (parsed) =>
        new AttachResourceStorageCommand(
          parsed.resourceId,
          parsed.storageVolumeId,
          parsed.destinationPath,
          parsed.mountMode,
        ),
    );
  }
}
