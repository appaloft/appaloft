import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type OperatorWorkList } from "../../ports";
import { tokens } from "../../tokens";
import { ListOperatorWorkQuery } from "./list-operator-work.query";
import { type OperatorWorkQueryService } from "./operator-work.query-service";

@QueryHandler(ListOperatorWorkQuery)
@injectable()
export class ListOperatorWorkQueryHandler
  implements QueryHandlerContract<ListOperatorWorkQuery, OperatorWorkList>
{
  constructor(
    @inject(tokens.operatorWorkQueryService)
    private readonly queryService: OperatorWorkQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ListOperatorWorkQuery,
  ): Promise<Result<OperatorWorkList>> {
    return ok(await this.queryService.list(context, query));
  }
}
