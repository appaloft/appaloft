import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type AuditEventListResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ListAuditEventsQueryInput,
  listAuditEventsQueryInputSchema,
} from "./audit-events.schema";

export { type ListAuditEventsQueryInput, listAuditEventsQueryInputSchema };

export class ListAuditEventsQuery extends Query<AuditEventListResult> {
  constructor(
    public readonly aggregateId?: string,
    public readonly eventType?: string,
    public readonly limit?: number,
    public readonly cursor?: string,
  ) {
    super();
  }

  static create(input: ListAuditEventsQueryInput = {}): Result<ListAuditEventsQuery> {
    return parseOperationInput(listAuditEventsQueryInputSchema, input).map(
      (parsed) =>
        new ListAuditEventsQuery(
          trimToUndefined(parsed.aggregateId),
          trimToUndefined(parsed.eventType),
          parsed.limit,
          trimToUndefined(parsed.cursor),
        ),
    );
  }
}
