import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ShowPreviewPolicyResult } from "../../ports";
import { tokens } from "../../tokens";
import { ShowPreviewPolicyQuery } from "./show-preview-policy.query";
import { type ShowPreviewPolicyQueryService } from "./show-preview-policy.query-service";

@QueryHandler(ShowPreviewPolicyQuery)
@injectable()
export class ShowPreviewPolicyQueryHandler
  implements QueryHandlerContract<ShowPreviewPolicyQuery, ShowPreviewPolicyResult>
{
  constructor(
    @inject(tokens.showPreviewPolicyQueryService)
    private readonly queryService: ShowPreviewPolicyQueryService,
  ) {}

  handle(context: ExecutionContext, query: ShowPreviewPolicyQuery) {
    return this.queryService.execute(context, {
      scope: query.scope,
    });
  }
}
