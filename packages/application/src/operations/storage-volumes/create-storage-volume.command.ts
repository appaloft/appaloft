import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type CreateStorageVolumeCommandInput,
  createStorageVolumeCommandInputSchema,
} from "./create-storage-volume.schema";

export { type CreateStorageVolumeCommandInput, createStorageVolumeCommandInputSchema };

export class CreateStorageVolumeCommand extends Command<{ id: string }> {
  constructor(
    public readonly projectId: string,
    public readonly environmentId: string,
    public readonly name: string,
    public readonly kind: CreateStorageVolumeCommandInput["kind"],
    public readonly description?: string,
    public readonly sourcePath?: string,
    public readonly backupRelationship?: CreateStorageVolumeCommandInput["backupRelationship"],
  ) {
    super();
  }

  static create(input: CreateStorageVolumeCommandInput): Result<CreateStorageVolumeCommand> {
    return parseOperationInput(createStorageVolumeCommandInputSchema, input).map(
      (parsed) =>
        new CreateStorageVolumeCommand(
          parsed.projectId,
          parsed.environmentId,
          parsed.name,
          parsed.kind,
          parsed.description,
          parsed.sourcePath,
          parsed.backupRelationship,
        ),
    );
  }
}
