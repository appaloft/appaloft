import { inject, injectable } from "tsyringe";
import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type AuditEventExportResult } from "../../ports";
import { tokens } from "../../tokens";
import { ExportAuditEventsQuery } from "./export-audit-events.query";
import { type ExportAuditEventsQueryService } from "./export-audit-events.query-service";

@QueryHandler(ExportAuditEventsQuery)
@injectable()
export class ExportAuditEventsQueryHandler
  implements QueryHandlerContract<ExportAuditEventsQuery, AuditEventExportResult>
{
  constructor(
    @inject(tokens.exportAuditEventsQueryService)
    private readonly queryService: ExportAuditEventsQueryService,
  ) {}

  handle(context: ExecutionContext, query: ExportAuditEventsQuery) {
    return this.queryService.execute(context, query);
  }
}
