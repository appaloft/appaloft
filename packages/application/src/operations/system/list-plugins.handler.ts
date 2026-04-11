import { ok, type Result } from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type PluginSummary } from "../../ports";
import { tokens } from "../../tokens";
import { ListPluginsQuery } from "./list-plugins.query";
import { type ListPluginsQueryService } from "./list-plugins.query-service";

@QueryHandler(ListPluginsQuery)
@injectable()
export class ListPluginsQueryHandler
  implements QueryHandlerContract<ListPluginsQuery, { items: PluginSummary[] }>
{
  constructor(
    @inject(tokens.pluginsQueryService)
    private readonly queryService: ListPluginsQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ListPluginsQuery,
  ): Promise<Result<{ items: PluginSummary[] }>> {
    void query;
    return ok(await this.queryService.execute(context));
  }
}
