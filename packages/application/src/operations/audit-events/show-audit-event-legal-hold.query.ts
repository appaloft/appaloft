import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type AuditEventLegalHoldShowResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ShowAuditEventLegalHoldQueryInput,
  showAuditEventLegalHoldQueryInputSchema,
} from "./audit-events.schema";

export {
  type ShowAuditEventLegalHoldQueryInput,
  showAuditEventLegalHoldQueryInputSchema,
} from "./audit-events.schema";

export class ShowAuditEventLegalHoldQuery extends Query<AuditEventLegalHoldShowResult> {
  constructor(public readonly holdId: string) {
    super();
  }

  static create(input: ShowAuditEventLegalHoldQueryInput): Result<ShowAuditEventLegalHoldQuery> {
    return parseOperationInput(showAuditEventLegalHoldQueryInputSchema, input).map(
      (parsed) => new ShowAuditEventLegalHoldQuery(parsed.holdId),
    );
  }
}
