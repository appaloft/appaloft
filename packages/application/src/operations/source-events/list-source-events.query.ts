import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type SourceEventListResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ListSourceEventsQueryInput,
  type ListSourceEventsQueryPayload,
  listSourceEventsQueryInputSchema,
} from "./list-source-events.schema";

export {
  type ListSourceEventsQueryInput,
  type ListSourceEventsQueryPayload,
  listSourceEventsQueryInputSchema,
} from "./list-source-events.schema";

export class ListSourceEventsQuery extends Query<SourceEventListResult> {
  constructor(
    public readonly projectId?: string,
    public readonly resourceId?: string,
    public readonly status?: ListSourceEventsQueryPayload["status"],
    public readonly sourceKind?: ListSourceEventsQueryPayload["sourceKind"],
    public readonly limit?: number,
    public readonly cursor?: string,
  ) {
    super();
  }

  static create(input: ListSourceEventsQueryInput = {}): Result<ListSourceEventsQuery> {
    return parseOperationInput(listSourceEventsQueryInputSchema, input).map(
      (parsed) =>
        new ListSourceEventsQuery(
          trimToUndefined(parsed.projectId),
          trimToUndefined(parsed.resourceId),
          parsed.status,
          parsed.sourceKind,
          parsed.limit,
          trimToUndefined(parsed.cursor),
        ),
    );
  }
}
