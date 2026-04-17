import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type EnvironmentSummary } from "../../ports";
import { tokens } from "../../tokens";
import { ListEnvironmentsQuery } from "./list-environments.query";
import { type ListEnvironmentsQueryService } from "./list-environments.query-service";

@QueryHandler(ListEnvironmentsQuery)
@injectable()
export class ListEnvironmentsQueryHandler
  implements QueryHandlerContract<ListEnvironmentsQuery, { items: EnvironmentSummary[] }>
{
  constructor(
    @inject(tokens.listEnvironmentsQueryService)
    private readonly queryService: ListEnvironmentsQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ListEnvironmentsQuery,
  ): Promise<Result<{ items: EnvironmentSummary[] }>> {
    return ok(
      await this.queryService.execute(
        context,
        query.projectId ? { projectId: query.projectId } : undefined,
      ),
    );
  }
}
