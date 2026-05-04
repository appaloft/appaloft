import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type RenameStorageVolumeCommandInput,
  renameStorageVolumeCommandInputSchema,
} from "./rename-storage-volume.schema";

export { type RenameStorageVolumeCommandInput, renameStorageVolumeCommandInputSchema };

export class RenameStorageVolumeCommand extends Command<{ id: string }> {
  constructor(
    public readonly storageVolumeId: string,
    public readonly name: string,
  ) {
    super();
  }

  static create(input: RenameStorageVolumeCommandInput): Result<RenameStorageVolumeCommand> {
    return parseOperationInput(renameStorageVolumeCommandInputSchema, input).map(
      (parsed) => new RenameStorageVolumeCommand(parsed.storageVolumeId, parsed.name),
    );
  }
}
