import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type AuditEventArchiveShowResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ShowAuditEventArchiveQueryInput,
  showAuditEventArchiveQueryInputSchema,
} from "./audit-events.schema";

export {
  type ShowAuditEventArchiveQueryInput,
  showAuditEventArchiveQueryInputSchema,
} from "./audit-events.schema";

export class ShowAuditEventArchiveQuery extends Query<AuditEventArchiveShowResult> {
  constructor(public readonly archiveId: string) {
    super();
  }

  static create(input: ShowAuditEventArchiveQueryInput): Result<ShowAuditEventArchiveQuery> {
    return parseOperationInput(showAuditEventArchiveQueryInputSchema, input).map(
      (parsed) => new ShowAuditEventArchiveQuery(trimToUndefined(parsed.archiveId) ?? ""),
    );
  }
}
