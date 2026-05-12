import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type AuditEventListResult } from "../../ports";
import { tokens } from "../../tokens";
import { ListAuditEventsQuery } from "./list-audit-events.query";
import { type ListAuditEventsQueryService } from "./list-audit-events.query-service";

@QueryHandler(ListAuditEventsQuery)
@injectable()
export class ListAuditEventsQueryHandler
  implements QueryHandlerContract<ListAuditEventsQuery, AuditEventListResult>
{
  constructor(
    @inject(tokens.listAuditEventsQueryService)
    private readonly queryService: ListAuditEventsQueryService,
  ) {}

  handle(context: ExecutionContext, query: ListAuditEventsQuery) {
    return this.queryService.execute(context, query);
  }
}
