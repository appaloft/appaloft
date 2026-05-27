import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { CountProjectsQuery } from "./count-projects.query";
import { type CountProjectsQueryService } from "./count-projects.query-service";

@QueryHandler(CountProjectsQuery)
@injectable()
export class CountProjectsQueryHandler
  implements QueryHandlerContract<CountProjectsQuery, { count: number }>
{
  constructor(
    @inject(tokens.countProjectsQueryService)
    private readonly queryService: CountProjectsQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: CountProjectsQuery,
  ): Promise<Result<{ count: number }>> {
    return this.queryService.execute(context, query);
  }
}
