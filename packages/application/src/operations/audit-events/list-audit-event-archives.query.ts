import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type AuditEventArchiveListResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ListAuditEventArchivesQueryInput,
  listAuditEventArchivesQueryInputSchema,
} from "./audit-events.schema";

export {
  type ListAuditEventArchivesQueryInput,
  listAuditEventArchivesQueryInputSchema,
} from "./audit-events.schema";

export class ListAuditEventArchivesQuery extends Query<AuditEventArchiveListResult> {
  constructor(
    public readonly aggregateId?: string,
    public readonly eventType?: string,
    public readonly from?: string,
    public readonly to?: string,
    public readonly limit: number = 50,
    public readonly cursor?: string,
  ) {
    super();
  }

  static create(input: ListAuditEventArchivesQueryInput = {}): Result<ListAuditEventArchivesQuery> {
    return parseOperationInput(listAuditEventArchivesQueryInputSchema, input).map(
      (parsed) =>
        new ListAuditEventArchivesQuery(
          trimToUndefined(parsed.aggregateId),
          trimToUndefined(parsed.eventType),
          parsed.from,
          parsed.to,
          parsed.limit,
          trimToUndefined(parsed.cursor),
        ),
    );
  }
}
