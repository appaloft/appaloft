import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ListStorageVolumeBackupsResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ListStorageVolumeBackupsQueryInput,
  listStorageVolumeBackupsQueryInputSchema,
} from "./list-storage-volume-backups.schema";

export { type ListStorageVolumeBackupsQueryInput, listStorageVolumeBackupsQueryInputSchema };

export class ListStorageVolumeBackupsQuery extends Query<ListStorageVolumeBackupsResult> {
  constructor(
    public readonly storageVolumeId: string,
    public readonly status?: ListStorageVolumeBackupsQueryInput["status"],
  ) {
    super();
  }

  static create(input: ListStorageVolumeBackupsQueryInput): Result<ListStorageVolumeBackupsQuery> {
    return parseOperationInput(listStorageVolumeBackupsQueryInputSchema, input).map(
      (parsed) => new ListStorageVolumeBackupsQuery(parsed.storageVolumeId, parsed.status),
    );
  }
}
