import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type Clock, type SourceEventListResult, type SourceEventReadModel } from "../../ports";
import { tokens } from "../../tokens";
import { type ListSourceEventsQuery } from "./list-source-events.query";

@injectable()
export class ListSourceEventsQueryService {
  constructor(
    @inject(tokens.sourceEventReadModel)
    private readonly sourceEventReadModel: SourceEventReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ListSourceEventsQuery,
  ): Promise<Result<SourceEventListResult>> {
    if (!query.projectId && !query.resourceId) {
      return err(
        domainError.sourceEventScopeRequired(
          "Source event list requires project or resource scope",
          {
            phase: "source-event-read",
            requiredScopeKind: "project-or-resource",
          },
        ),
      );
    }

    const page = await this.sourceEventReadModel.list(toRepositoryContext(context), {
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.sourceKind ? { sourceKind: query.sourceKind } : {}),
      ...(query.limit ? { limit: query.limit } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });

    return ok({
      ...page,
      generatedAt: this.clock.now(),
    });
  }
}
