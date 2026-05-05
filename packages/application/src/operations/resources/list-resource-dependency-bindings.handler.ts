import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ListResourceDependencyBindingsResult } from "../../ports";
import { tokens } from "../../tokens";
import { ListResourceDependencyBindingsQuery } from "./list-resource-dependency-bindings.query";
import { type ListResourceDependencyBindingsQueryService } from "./list-resource-dependency-bindings.query-service";

@QueryHandler(ListResourceDependencyBindingsQuery)
@injectable()
export class ListResourceDependencyBindingsQueryHandler
  implements
    QueryHandlerContract<ListResourceDependencyBindingsQuery, ListResourceDependencyBindingsResult>
{
  constructor(
    @inject(tokens.listResourceDependencyBindingsQueryService)
    private readonly queryService: ListResourceDependencyBindingsQueryService,
  ) {}

  handle(
    context: ExecutionContext,
    query: ListResourceDependencyBindingsQuery,
  ): Promise<Result<ListResourceDependencyBindingsResult>> {
    return this.queryService.execute(context, { resourceId: query.resourceId });
  }
}
