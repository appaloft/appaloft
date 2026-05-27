import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { CountServersQuery } from "./count-servers.query";
import { type CountServersQueryService } from "./count-servers.query-service";

@QueryHandler(CountServersQuery)
@injectable()
export class CountServersQueryHandler
  implements QueryHandlerContract<CountServersQuery, { count: number }>
{
  constructor(
    @inject(tokens.countServersQueryService)
    private readonly queryService: CountServersQueryService,
  ) {}

  async handle(context: ExecutionContext): Promise<Result<{ count: number }>> {
    return ok(await this.queryService.execute(context));
  }
}
