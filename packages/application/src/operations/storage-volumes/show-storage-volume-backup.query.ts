import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ShowStorageVolumeBackupResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ShowStorageVolumeBackupQueryInput,
  showStorageVolumeBackupQueryInputSchema,
} from "./show-storage-volume-backup.schema";

export { type ShowStorageVolumeBackupQueryInput, showStorageVolumeBackupQueryInputSchema };

export class ShowStorageVolumeBackupQuery extends Query<ShowStorageVolumeBackupResult> {
  constructor(public readonly backupId: string) {
    super();
  }

  static create(input: ShowStorageVolumeBackupQueryInput): Result<ShowStorageVolumeBackupQuery> {
    return parseOperationInput(showStorageVolumeBackupQueryInputSchema, input).map(
      (parsed) => new ShowStorageVolumeBackupQuery(parsed.backupId),
    );
  }
}
