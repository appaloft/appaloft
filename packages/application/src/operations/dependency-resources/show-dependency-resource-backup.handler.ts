import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ShowDependencyResourceBackupResult } from "../../ports";
import { tokens } from "../../tokens";
import { ShowDependencyResourceBackupQuery } from "./show-dependency-resource-backup.query";
import { type ShowDependencyResourceBackupQueryService } from "./show-dependency-resource-backup.query-service";

@QueryHandler(ShowDependencyResourceBackupQuery)
@injectable()
export class ShowDependencyResourceBackupQueryHandler
  implements
    QueryHandlerContract<ShowDependencyResourceBackupQuery, ShowDependencyResourceBackupResult>
{
  constructor(
    @inject(tokens.showDependencyResourceBackupQueryService)
    private readonly queryService: ShowDependencyResourceBackupQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ShowDependencyResourceBackupQuery,
  ): Promise<Result<ShowDependencyResourceBackupResult>> {
    return this.queryService.execute(context, query);
  }
}
