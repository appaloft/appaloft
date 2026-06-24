import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type InspectDependencyResourceResult } from "../../ports";
import { tokens } from "../../tokens";
import { InspectDependencyResourceQuery } from "./inspect-dependency-resource.query";
import { type InspectDependencyResourceQueryService } from "./inspect-dependency-resource.query-service";

@QueryHandler(InspectDependencyResourceQuery)
@injectable()
export class InspectDependencyResourceQueryHandler
  implements QueryHandlerContract<InspectDependencyResourceQuery, InspectDependencyResourceResult>
{
  constructor(
    @inject(tokens.inspectDependencyResourceQueryService)
    private readonly queryService: InspectDependencyResourceQueryService,
  ) {}

  handle(
    context: ExecutionContext,
    query: InspectDependencyResourceQuery,
  ): Promise<Result<InspectDependencyResourceResult>> {
    return this.queryService.execute(context, query);
  }
}
