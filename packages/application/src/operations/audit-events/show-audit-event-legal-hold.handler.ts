import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type AuditEventLegalHoldShowResult } from "../../ports";
import { tokens } from "../../tokens";
import { ShowAuditEventLegalHoldQuery } from "./show-audit-event-legal-hold.query";
import { type ShowAuditEventLegalHoldQueryService } from "./show-audit-event-legal-hold.query-service";

@QueryHandler(ShowAuditEventLegalHoldQuery)
@injectable()
export class ShowAuditEventLegalHoldQueryHandler
  implements QueryHandlerContract<ShowAuditEventLegalHoldQuery, AuditEventLegalHoldShowResult>
{
  constructor(
    @inject(tokens.showAuditEventLegalHoldQueryService)
    private readonly queryService: ShowAuditEventLegalHoldQueryService,
  ) {}

  handle(context: ExecutionContext, query: ShowAuditEventLegalHoldQuery) {
    return this.queryService.execute(context, query);
  }
}
