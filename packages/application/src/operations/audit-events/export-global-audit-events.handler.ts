import { inject, injectable } from "tsyringe";
import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type AuditEventGlobalExportResult } from "../../ports";
import { tokens } from "../../tokens";
import { ExportGlobalAuditEventsQuery } from "./export-global-audit-events.query";
import { type ExportGlobalAuditEventsQueryService } from "./export-global-audit-events.query-service";

@QueryHandler(ExportGlobalAuditEventsQuery)
@injectable()
export class ExportGlobalAuditEventsQueryHandler
  implements QueryHandlerContract<ExportGlobalAuditEventsQuery, AuditEventGlobalExportResult>
{
  constructor(
    @inject(tokens.exportGlobalAuditEventsQueryService)
    private readonly queryService: ExportGlobalAuditEventsQueryService,
  ) {}

  handle(context: ExecutionContext, query: ExportGlobalAuditEventsQuery) {
    return this.queryService.execute(context, query);
  }
}
