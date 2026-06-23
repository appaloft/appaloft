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
    public readonly organizationId?: string,
    public readonly projectId?: string,
    public readonly action?: readonly string[],
    public readonly resourceType?: readonly string[],
    public readonly actorId?: readonly string[],
    public readonly limit: number = 100,
    public readonly cursor?: string,
    public readonly order: "asc" | "desc" = "asc",
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
          trimToUndefined(parsed.organizationId),
          trimToUndefined(parsed.projectId),
          parsed.action,
          parsed.resourceType,
          parsed.actorId,
          parsed.limit,
          trimToUndefined(parsed.cursor),
          parsed.order,
        ),
    );
  }
}
