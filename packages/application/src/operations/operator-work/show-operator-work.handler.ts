import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type OperatorWorkDetail } from "../../ports";
import { tokens } from "../../tokens";
import { type OperatorWorkQueryService } from "./operator-work.query-service";
import { ShowOperatorWorkQuery } from "./show-operator-work.query";

@QueryHandler(ShowOperatorWorkQuery)
@injectable()
export class ShowOperatorWorkQueryHandler
  implements QueryHandlerContract<ShowOperatorWorkQuery, OperatorWorkDetail>
{
  constructor(
    @inject(tokens.operatorWorkQueryService)
    private readonly queryService: OperatorWorkQueryService,
  ) {}

  handle(context: ExecutionContext, query: ShowOperatorWorkQuery) {
    return this.queryService.show(context, query);
  }
}
