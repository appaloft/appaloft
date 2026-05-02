import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type ResourceAccessFailureEvidenceLookup } from "../../ports";
import { tokens } from "../../tokens";
import { ResourceAccessFailureEvidenceLookupQuery } from "./resource-access-failure-evidence-lookup.query";
import { type ResourceAccessFailureEvidenceLookupQueryService } from "./resource-access-failure-evidence-lookup.query-service";

@QueryHandler(ResourceAccessFailureEvidenceLookupQuery)
@injectable()
export class ResourceAccessFailureEvidenceLookupQueryHandler
  implements
    QueryHandlerContract<
      ResourceAccessFailureEvidenceLookupQuery,
      ResourceAccessFailureEvidenceLookup
    >
{
  constructor(
    @inject(tokens.resourceAccessFailureEvidenceLookupQueryService)
    private readonly queryService: ResourceAccessFailureEvidenceLookupQueryService,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ResourceAccessFailureEvidenceLookupQuery,
  ): Promise<Result<ResourceAccessFailureEvidenceLookup>> {
    return this.queryService.execute(context, query);
  }
}
