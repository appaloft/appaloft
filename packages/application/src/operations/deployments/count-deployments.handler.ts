import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { CountDeploymentsQuery } from "./count-deployments.query";
import { type CountDeploymentsQueryService } from "./count-deployments.query-service";

@QueryHandler(CountDeploymentsQuery)
@injectable()
export class CountDeploymentsQueryHandler
  implements QueryHandlerContract<CountDeploymentsQuery, { count: number }>
{
  constructor(
    @inject(tokens.countDeploymentsQueryService)
    private readonly queryService: CountDeploymentsQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: CountDeploymentsQuery,
  ): Promise<Result<{ count: number }>> {
    return ok(await this.queryService.execute(context, query));
  }
}
