import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type IntegrationDescriptor } from "../../ports";
import { tokens } from "../../tokens";
import { ListIntegrationsQuery } from "./list-integrations.query";
import { type ListIntegrationsQueryService } from "./list-integrations.query-service";

@QueryHandler(ListIntegrationsQuery)
@injectable()
export class ListIntegrationsQueryHandler
  implements QueryHandlerContract<ListIntegrationsQuery, { items: IntegrationDescriptor[] }>
{
  constructor(
    @inject(tokens.integrationsQueryService)
    private readonly queryService: ListIntegrationsQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ListIntegrationsQuery,
  ): Promise<Result<{ items: IntegrationDescriptor[] }>> {
    void query;
    return ok(await this.queryService.execute(context));
  }
}
