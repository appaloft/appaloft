import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type AuditEventArchiveShowResult } from "../../ports";
import { tokens } from "../../tokens";
import { ShowAuditEventArchiveQuery } from "./show-audit-event-archive.query";
import { type ShowAuditEventArchiveQueryService } from "./show-audit-event-archive.query-service";

@QueryHandler(ShowAuditEventArchiveQuery)
@injectable()
export class ShowAuditEventArchiveQueryHandler
  implements QueryHandlerContract<ShowAuditEventArchiveQuery, AuditEventArchiveShowResult>
{
  constructor(
    @inject(tokens.showAuditEventArchiveQueryService)
    private readonly queryService: ShowAuditEventArchiveQueryService,
  ) {}

  handle(context: ExecutionContext, query: ShowAuditEventArchiveQuery) {
    return this.queryService.execute(context, query);
  }
}
