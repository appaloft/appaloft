import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type AuditEventGlobalExportResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ExportGlobalAuditEventsQueryInput,
  exportGlobalAuditEventsQueryInputSchema,
} from "./audit-events.schema";

export { type ExportGlobalAuditEventsQueryInput, exportGlobalAuditEventsQueryInputSchema };

export class ExportGlobalAuditEventsQuery extends Query<AuditEventGlobalExportResult> {
  constructor(
    public readonly from: string,
    public readonly to: string,
    public readonly aggregateId?: string,
    public readonly eventType?: string,
    public readonly limit: number = 100,
  ) {
    super();
  }

  static create(input: ExportGlobalAuditEventsQueryInput): Result<ExportGlobalAuditEventsQuery> {
    return parseOperationInput(exportGlobalAuditEventsQueryInputSchema, input).map(
      (parsed) =>
        new ExportGlobalAuditEventsQuery(
          parsed.from,
          parsed.to,
          trimToUndefined(parsed.aggregateId),
          trimToUndefined(parsed.eventType),
          parsed.limit,
        ),
    );
  }
}
