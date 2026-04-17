import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ResourceRuntimeLogsResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ResourceRuntimeLogsQueryInput,
  resourceRuntimeLogsQueryInputSchema,
} from "./resource-runtime-logs.schema";

export {
  type ResourceRuntimeLogsQueryInput,
  resourceRuntimeLogsQueryInputSchema,
} from "./resource-runtime-logs.schema";

export class ResourceRuntimeLogsQuery extends Query<ResourceRuntimeLogsResult> {
  constructor(
    public readonly resourceId: string,
    public readonly tailLines: number,
    public readonly follow: boolean,
    public readonly signal?: AbortSignal,
    public readonly deploymentId?: string,
    public readonly serviceName?: string,
    public readonly since?: string,
    public readonly cursor?: string,
  ) {
    super();
  }

  static create(
    input: ResourceRuntimeLogsQueryInput,
    options?: {
      signal?: AbortSignal;
    },
  ): Result<ResourceRuntimeLogsQuery> {
    return parseOperationInput(resourceRuntimeLogsQueryInputSchema, input).map(
      (parsed) =>
        new ResourceRuntimeLogsQuery(
          parsed.resourceId,
          parsed.tailLines,
          parsed.follow,
          options?.signal,
          trimToUndefined(parsed.deploymentId),
          trimToUndefined(parsed.serviceName),
          trimToUndefined(parsed.since),
          trimToUndefined(parsed.cursor),
        ),
    );
  }
}
