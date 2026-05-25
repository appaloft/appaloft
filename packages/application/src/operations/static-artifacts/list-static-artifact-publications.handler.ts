import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import {
  type StaticArtifactPublicationReadModelPort,
  type StaticArtifactPublicationSummary,
} from "../../ports";
import { tokens } from "../../tokens";
import { ListStaticArtifactPublicationsQuery } from "./list-static-artifact-publications.query";

@QueryHandler(ListStaticArtifactPublicationsQuery)
@injectable()
export class ListStaticArtifactPublicationsQueryHandler
  implements
    QueryHandlerContract<
      ListStaticArtifactPublicationsQuery,
      { items: StaticArtifactPublicationSummary[] }
    >
{
  constructor(
    @inject(tokens.staticArtifactPublicationReadModelPort)
    private readonly readModel: StaticArtifactPublicationReadModelPort,
  ) {}

  async handle(
    context: ExecutionContext,
    query: ListStaticArtifactPublicationsQuery,
  ): Promise<Result<{ items: StaticArtifactPublicationSummary[] }>> {
    return this.readModel.listPublications(context, {
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      limit: query.limit,
    });
  }
}
