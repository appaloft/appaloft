import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ShowResourceSecretReferenceResult } from "../../ports";
import { tokens } from "../../tokens";
import { type ResourceSecretReferenceQueryService } from "./resource-secret-reference.query-service";
import { ShowResourceSecretReferenceQuery } from "./show-resource-secret-reference.query";

@QueryHandler(ShowResourceSecretReferenceQuery)
@injectable()
export class ShowResourceSecretReferenceQueryHandler
  implements
    QueryHandlerContract<ShowResourceSecretReferenceQuery, ShowResourceSecretReferenceResult>
{
  constructor(
    @inject(tokens.resourceSecretReferenceQueryService)
    private readonly queryService: ResourceSecretReferenceQueryService,
  ) {}

  handle(context: ExecutionContext, query: ShowResourceSecretReferenceQuery) {
    return this.queryService.show(context, query);
  }
}
