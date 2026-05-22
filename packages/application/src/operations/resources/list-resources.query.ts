import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ResourceSummary } from "../../ports";
import { boundedListLimit, parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ListResourcesQueryInput,
  listResourcesQueryInputSchema,
} from "./list-resources.schema";

export {
  type ListResourcesQueryInput,
  listResourcesQueryInputSchema,
} from "./list-resources.schema";

export class ListResourcesQuery extends Query<{ items: ResourceSummary[] }> {
  constructor(
    public readonly projectId?: string,
    public readonly environmentId?: string,
    public readonly limit: number = boundedListLimit(),
  ) {
    super();
  }

  static create(input?: ListResourcesQueryInput): Result<ListResourcesQuery> {
    return parseOperationInput(listResourcesQueryInputSchema, input ?? {}).map(
      (parsed) =>
        new ListResourcesQuery(
          trimToUndefined(parsed.projectId),
          trimToUndefined(parsed.environmentId),
          boundedListLimit(parsed.limit),
        ),
    );
  }
}
