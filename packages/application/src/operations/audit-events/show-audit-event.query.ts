import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type AuditEventShowResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ShowAuditEventQueryInput,
  showAuditEventQueryInputSchema,
} from "./audit-events.schema";

export { type ShowAuditEventQueryInput, showAuditEventQueryInputSchema };

export class ShowAuditEventQuery extends Query<AuditEventShowResult> {
  constructor(
    public readonly auditEventId: string,
    public readonly aggregateId?: string,
  ) {
    super();
  }

  static create(input: ShowAuditEventQueryInput): Result<ShowAuditEventQuery> {
    return parseOperationInput(showAuditEventQueryInputSchema, input).map(
      (parsed) => new ShowAuditEventQuery(parsed.auditEventId, trimToUndefined(parsed.aggregateId)),
    );
  }
}
