import { ok, type Result } from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type DomainBindingSummary } from "../../ports";
import { tokens } from "../../tokens";
import { ListDomainBindingsQuery } from "./list-domain-bindings.query";
import { type ListDomainBindingsQueryService } from "./list-domain-bindings.query-service";

@QueryHandler(ListDomainBindingsQuery)
@injectable()
export class ListDomainBindingsQueryHandler
  implements QueryHandlerContract<ListDomainBindingsQuery, { items: DomainBindingSummary[] }>
{
  constructor(
    @inject(tokens.listDomainBindingsQueryService)
    private readonly queryService: ListDomainBindingsQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ListDomainBindingsQuery,
  ): Promise<Result<{ items: DomainBindingSummary[] }>> {
    return ok(
      await this.queryService.execute(
        context,
        query.projectId || query.environmentId || query.resourceId
          ? {
              ...(query.projectId ? { projectId: query.projectId } : {}),
              ...(query.environmentId ? { environmentId: query.environmentId } : {}),
              ...(query.resourceId ? { resourceId: query.resourceId } : {}),
            }
          : undefined,
      ),
    );
  }
}
