import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ResourceRuntimeLogArchiveListResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ListResourceRuntimeLogArchivesQueryInput,
  listResourceRuntimeLogArchivesQueryInputSchema,
} from "./resource-runtime-log-archives.schema";

export {
  type ListResourceRuntimeLogArchivesQueryInput,
  listResourceRuntimeLogArchivesQueryInputSchema,
} from "./resource-runtime-log-archives.schema";

export class ListResourceRuntimeLogArchivesQuery extends Query<ResourceRuntimeLogArchiveListResult> {
  constructor(
    public readonly limit: number,
    public readonly resourceId?: string,
    public readonly deploymentId?: string,
    public readonly serverId?: string,
    public readonly serviceName?: string,
    public readonly cursor?: string,
  ) {
    super();
  }

  static create(
    input: ListResourceRuntimeLogArchivesQueryInput,
  ): Result<ListResourceRuntimeLogArchivesQuery> {
    return parseOperationInput(listResourceRuntimeLogArchivesQueryInputSchema, input).map(
      (parsed) =>
        new ListResourceRuntimeLogArchivesQuery(
          parsed.limit,
          trimToUndefined(parsed.resourceId),
          trimToUndefined(parsed.deploymentId),
          trimToUndefined(parsed.serverId),
          trimToUndefined(parsed.serviceName),
          trimToUndefined(parsed.cursor),
        ),
    );
  }
}
