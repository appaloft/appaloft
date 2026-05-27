import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { CountResourcesQuery } from "./count-resources.query";
import { type CountResourcesQueryService } from "./count-resources.query-service";

@QueryHandler(CountResourcesQuery)
@injectable()
export class CountResourcesQueryHandler
  implements QueryHandlerContract<CountResourcesQuery, { count: number }>
{
  constructor(
    @inject(tokens.countResourcesQueryService)
    private readonly queryService: CountResourcesQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: CountResourcesQuery,
  ): Promise<Result<{ count: number }>> {
    return ok(await this.queryService.execute(context, query));
  }
}
