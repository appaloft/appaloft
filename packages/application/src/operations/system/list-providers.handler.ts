import { ok, type Result } from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ProviderDescriptor } from "../../ports";
import { tokens } from "../../tokens";
import { ListProvidersQuery } from "./list-providers.query";
import { type ListProvidersQueryService } from "./list-providers.query-service";

@QueryHandler(ListProvidersQuery)
@injectable()
export class ListProvidersQueryHandler
  implements QueryHandlerContract<ListProvidersQuery, { items: ProviderDescriptor[] }>
{
  constructor(
    @inject(tokens.providersQueryService)
    private readonly queryService: ListProvidersQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ListProvidersQuery,
  ): Promise<Result<{ items: ProviderDescriptor[] }>> {
    void query;
    return ok(await this.queryService.execute(context));
  }
}
