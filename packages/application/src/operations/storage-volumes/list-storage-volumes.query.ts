import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ListStorageVolumesResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ListStorageVolumesQueryInput,
  listStorageVolumesQueryInputSchema,
} from "./list-storage-volumes.schema";

export { type ListStorageVolumesQueryInput, listStorageVolumesQueryInputSchema };

export class ListStorageVolumesQuery extends Query<ListStorageVolumesResult> {
  constructor(
    public readonly projectId?: string,
    public readonly environmentId?: string,
  ) {
    super();
  }

  static create(input: ListStorageVolumesQueryInput = {}): Result<ListStorageVolumesQuery> {
    return parseOperationInput(listStorageVolumesQueryInputSchema, input).map(
      (parsed) => new ListStorageVolumesQuery(parsed.projectId, parsed.environmentId),
    );
  }
}
