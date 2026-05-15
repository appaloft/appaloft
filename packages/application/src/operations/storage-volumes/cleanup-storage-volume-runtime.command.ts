import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type StorageRuntimeCleanupResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type CleanupStorageVolumeRuntimeCommandInput,
  cleanupStorageVolumeRuntimeCommandInputSchema,
  type ParsedCleanupStorageVolumeRuntimeCommandInput,
} from "./cleanup-storage-volume-runtime.schema";

export {
  type CleanupStorageVolumeRuntimeCommandInput,
  cleanupStorageVolumeRuntimeCommandInputSchema,
  type ParsedCleanupStorageVolumeRuntimeCommandInput,
};

export class CleanupStorageVolumeRuntimeCommand extends Command<StorageRuntimeCleanupResult> {
  constructor(public readonly input: ParsedCleanupStorageVolumeRuntimeCommandInput) {
    super();
  }

  static create(
    input: CleanupStorageVolumeRuntimeCommandInput,
  ): Result<CleanupStorageVolumeRuntimeCommand> {
    return parseOperationInput(cleanupStorageVolumeRuntimeCommandInputSchema, input).map(
      (parsed) => new CleanupStorageVolumeRuntimeCommand(parsed),
    );
  }
}
