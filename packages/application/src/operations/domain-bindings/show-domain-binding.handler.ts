import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type DomainBindingDetail } from "../../ports";
import { tokens } from "../../tokens";
import { ShowDomainBindingQuery } from "./show-domain-binding.query";
import { type ShowDomainBindingQueryService } from "./show-domain-binding.query-service";

@QueryHandler(ShowDomainBindingQuery)
@injectable()
export class ShowDomainBindingQueryHandler
  implements QueryHandlerContract<ShowDomainBindingQuery, DomainBindingDetail>
{
  constructor(
    @inject(tokens.showDomainBindingQueryService)
    private readonly queryService: ShowDomainBindingQueryService,
  ) {}

  handle(
    context: ExecutionContext,
    query: ShowDomainBindingQuery,
  ): Promise<Result<DomainBindingDetail>> {
    return this.queryService.execute(context, query);
  }
}
