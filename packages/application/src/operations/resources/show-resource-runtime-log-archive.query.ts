import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ResourceRuntimeLogArchiveShowResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ShowResourceRuntimeLogArchiveQueryInput,
  showResourceRuntimeLogArchiveQueryInputSchema,
} from "./resource-runtime-log-archives.schema";

export {
  type ShowResourceRuntimeLogArchiveQueryInput,
  showResourceRuntimeLogArchiveQueryInputSchema,
} from "./resource-runtime-log-archives.schema";

export class ShowResourceRuntimeLogArchiveQuery extends Query<ResourceRuntimeLogArchiveShowResult> {
  constructor(public readonly archiveId: string) {
    super();
  }

  static create(
    input: ShowResourceRuntimeLogArchiveQueryInput,
  ): Result<ShowResourceRuntimeLogArchiveQuery> {
    return parseOperationInput(showResourceRuntimeLogArchiveQueryInputSchema, input).map(
      (parsed) => new ShowResourceRuntimeLogArchiveQuery(parsed.archiveId),
    );
  }
}
