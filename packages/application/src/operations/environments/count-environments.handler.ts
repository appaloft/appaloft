import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { CountEnvironmentsQuery } from "./count-environments.query";
import { type CountEnvironmentsQueryService } from "./count-environments.query-service";

@QueryHandler(CountEnvironmentsQuery)
@injectable()
export class CountEnvironmentsQueryHandler
  implements QueryHandlerContract<CountEnvironmentsQuery, { count: number }>
{
  constructor(
    @inject(tokens.countEnvironmentsQueryService)
    private readonly queryService: CountEnvironmentsQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: CountEnvironmentsQuery,
  ): Promise<Result<{ count: number }>> {
    return ok(await this.queryService.execute(context, query));
  }
}
