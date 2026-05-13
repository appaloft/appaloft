import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type AuditEventShowResult } from "../../ports";
import { tokens } from "../../tokens";
import { ShowAuditEventQuery } from "./show-audit-event.query";
import { type ShowAuditEventQueryService } from "./show-audit-event.query-service";

@QueryHandler(ShowAuditEventQuery)
@injectable()
export class ShowAuditEventQueryHandler
  implements QueryHandlerContract<ShowAuditEventQuery, AuditEventShowResult>
{
  constructor(
    @inject(tokens.showAuditEventQueryService)
    private readonly queryService: ShowAuditEventQueryService,
  ) {}

  handle(context: ExecutionContext, query: ShowAuditEventQuery) {
    return this.queryService.execute(context, query);
  }
}
