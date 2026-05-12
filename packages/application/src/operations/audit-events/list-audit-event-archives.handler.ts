import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type AuditEventArchiveListResult } from "../../ports";
import { tokens } from "../../tokens";
import { ListAuditEventArchivesQuery } from "./list-audit-event-archives.query";
import { type ListAuditEventArchivesQueryService } from "./list-audit-event-archives.query-service";

@QueryHandler(ListAuditEventArchivesQuery)
@injectable()
export class ListAuditEventArchivesQueryHandler
  implements QueryHandlerContract<ListAuditEventArchivesQuery, AuditEventArchiveListResult>
{
  constructor(
    @inject(tokens.listAuditEventArchivesQueryService)
    private readonly queryService: ListAuditEventArchivesQueryService,
  ) {}

  handle(context: ExecutionContext, query: ListAuditEventArchivesQuery) {
    return this.queryService.execute(context, query);
  }
}
