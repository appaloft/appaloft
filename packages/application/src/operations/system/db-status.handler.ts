import { ok, type Result } from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { DbStatusQuery } from "./db-status.query";
import { type DbStatusQueryService } from "./db-status.query-service";

@QueryHandler(DbStatusQuery)
@injectable()
export class DbStatusQueryHandler
  implements QueryHandlerContract<DbStatusQuery, { pending: string[]; executed: string[] }>
{
  constructor(
    @inject(tokens.dbStatusQueryService)
    private readonly queryService: DbStatusQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: DbStatusQuery,
  ): Promise<Result<{ pending: string[]; executed: string[] }>> {
    void query;
    return ok(await this.queryService.execute(context));
  }
}
