import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ShowStorageVolumeResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ShowStorageVolumeQueryInput,
  showStorageVolumeQueryInputSchema,
} from "./show-storage-volume.schema";

export { type ShowStorageVolumeQueryInput, showStorageVolumeQueryInputSchema };

export class ShowStorageVolumeQuery extends Query<ShowStorageVolumeResult> {
  constructor(public readonly storageVolumeId: string) {
    super();
  }

  static create(input: ShowStorageVolumeQueryInput): Result<ShowStorageVolumeQuery> {
    return parseOperationInput(showStorageVolumeQueryInputSchema, input).map(
      (parsed) => new ShowStorageVolumeQuery(parsed.storageVolumeId),
    );
  }
}
