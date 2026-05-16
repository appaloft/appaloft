import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ListResourceSecretReferencesResult } from "../../ports";
import { tokens } from "../../tokens";
import { ListResourceSecretReferencesQuery } from "./list-resource-secret-references.query";
import { type ResourceSecretReferenceQueryService } from "./resource-secret-reference.query-service";

@QueryHandler(ListResourceSecretReferencesQuery)
@injectable()
export class ListResourceSecretReferencesQueryHandler
  implements
    QueryHandlerContract<ListResourceSecretReferencesQuery, ListResourceSecretReferencesResult>
{
  constructor(
    @inject(tokens.resourceSecretReferenceQueryService)
    private readonly queryService: ResourceSecretReferenceQueryService,
  ) {}

  handle(context: ExecutionContext, query: ListResourceSecretReferencesQuery) {
    return this.queryService.list(context, query);
  }
}
