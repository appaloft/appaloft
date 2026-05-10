import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { ResolvePreviewPullRequestContextQuery } from "./resolve-preview-pull-request-context.query";
import { type ResolvePreviewPullRequestContextQueryService } from "./resolve-preview-pull-request-context.query-service";
import { type ResolvePreviewPullRequestContextResponse } from "./resolve-preview-pull-request-context.schema";

@QueryHandler(ResolvePreviewPullRequestContextQuery)
@injectable()
export class ResolvePreviewPullRequestContextQueryHandler
  implements
    QueryHandlerContract<
      ResolvePreviewPullRequestContextQuery,
      ResolvePreviewPullRequestContextResponse
    >
{
  constructor(
    @inject(tokens.resolvePreviewPullRequestContextQueryService)
    private readonly queryService: ResolvePreviewPullRequestContextQueryService,
  ) {}

  handle(context: ExecutionContext, query: ResolvePreviewPullRequestContextQuery) {
    return this.queryService.execute(context, query);
  }
}
