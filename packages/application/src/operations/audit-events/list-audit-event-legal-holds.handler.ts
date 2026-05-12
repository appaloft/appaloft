import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type AuditEventLegalHoldListResult } from "../../ports";
import { tokens } from "../../tokens";
import { ListAuditEventLegalHoldsQuery } from "./list-audit-event-legal-holds.query";
import { type ListAuditEventLegalHoldsQueryService } from "./list-audit-event-legal-holds.query-service";

@QueryHandler(ListAuditEventLegalHoldsQuery)
@injectable()
export class ListAuditEventLegalHoldsQueryHandler
  implements QueryHandlerContract<ListAuditEventLegalHoldsQuery, AuditEventLegalHoldListResult>
{
  constructor(
    @inject(tokens.listAuditEventLegalHoldsQueryService)
    private readonly queryService: ListAuditEventLegalHoldsQueryService,
  ) {}

  handle(context: ExecutionContext, query: ListAuditEventLegalHoldsQuery) {
    return this.queryService.execute(context, query);
  }
}
