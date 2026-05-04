import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type DeleteStorageVolumeCommandInput,
  deleteStorageVolumeCommandInputSchema,
} from "./delete-storage-volume.schema";

export { type DeleteStorageVolumeCommandInput, deleteStorageVolumeCommandInputSchema };

export class DeleteStorageVolumeCommand extends Command<{ id: string }> {
  constructor(public readonly storageVolumeId: string) {
    super();
  }

  static create(input: DeleteStorageVolumeCommandInput): Result<DeleteStorageVolumeCommand> {
    return parseOperationInput(deleteStorageVolumeCommandInputSchema, input).map(
      (parsed) => new DeleteStorageVolumeCommand(parsed.storageVolumeId),
    );
  }
}
