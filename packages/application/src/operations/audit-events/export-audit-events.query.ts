import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type AuditEventExportResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ExportAuditEventsQueryInput,
  exportAuditEventsQueryInputSchema,
} from "./audit-events.schema";

export { type ExportAuditEventsQueryInput, exportAuditEventsQueryInputSchema };

export class ExportAuditEventsQuery extends Query<AuditEventExportResult> {
  constructor(
    public readonly aggregateId?: string,
    public readonly eventType?: string,
    public readonly from?: string,
    public readonly to?: string,
    public readonly limit: number = 100,
  ) {
    super();
  }

  static create(input: ExportAuditEventsQueryInput = {}): Result<ExportAuditEventsQuery> {
    return parseOperationInput(exportAuditEventsQueryInputSchema, input).map(
      (parsed) =>
        new ExportAuditEventsQuery(
          trimToUndefined(parsed.aggregateId),
          trimToUndefined(parsed.eventType),
          parsed.from,
          parsed.to,
          parsed.limit,
        ),
    );
  }
}
