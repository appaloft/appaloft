import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type AuditEventLegalHoldListResult, type AuditEventLegalHoldStatus } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ListAuditEventLegalHoldsQueryInput,
  listAuditEventLegalHoldsQueryInputSchema,
} from "./audit-events.schema";

export {
  type ListAuditEventLegalHoldsQueryInput,
  listAuditEventLegalHoldsQueryInputSchema,
} from "./audit-events.schema";

export class ListAuditEventLegalHoldsQuery extends Query<AuditEventLegalHoldListResult> {
  constructor(
    public readonly status?: AuditEventLegalHoldStatus,
    public readonly aggregateId?: string,
    public readonly eventType?: string,
    public readonly limit: number = 50,
    public readonly cursor?: string,
  ) {
    super();
  }

  static create(
    input: ListAuditEventLegalHoldsQueryInput = {},
  ): Result<ListAuditEventLegalHoldsQuery> {
    return parseOperationInput(listAuditEventLegalHoldsQueryInputSchema, input).map(
      (parsed) =>
        new ListAuditEventLegalHoldsQuery(
          parsed.status,
          trimToUndefined(parsed.aggregateId),
          trimToUndefined(parsed.eventType),
          parsed.limit,
          trimToUndefined(parsed.cursor),
        ),
    );
  }
}
