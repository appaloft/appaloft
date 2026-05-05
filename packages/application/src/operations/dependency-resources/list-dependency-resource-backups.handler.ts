import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ListDependencyResourceBackupsResult } from "../../ports";
import { tokens } from "../../tokens";
import { ListDependencyResourceBackupsQuery } from "./list-dependency-resource-backups.query";
import { type ListDependencyResourceBackupsQueryService } from "./list-dependency-resource-backups.query-service";

@QueryHandler(ListDependencyResourceBackupsQuery)
@injectable()
export class ListDependencyResourceBackupsQueryHandler
  implements
    QueryHandlerContract<ListDependencyResourceBackupsQuery, ListDependencyResourceBackupsResult>
{
  constructor(
    @inject(tokens.listDependencyResourceBackupsQueryService)
    private readonly queryService: ListDependencyResourceBackupsQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ListDependencyResourceBackupsQuery,
  ): Promise<Result<ListDependencyResourceBackupsResult>> {
    return this.queryService.execute(context, query);
  }
}
