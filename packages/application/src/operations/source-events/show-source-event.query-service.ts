import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type SourceEventDetail, type SourceEventReadModel } from "../../ports";
import { tokens } from "../../tokens";
import { type ShowSourceEventQuery } from "./show-source-event.query";

@injectable()
export class ShowSourceEventQueryService {
  constructor(
    @inject(tokens.sourceEventReadModel)
    private readonly sourceEventReadModel: SourceEventReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ShowSourceEventQuery,
  ): Promise<Result<SourceEventDetail>> {
    if (!query.projectId && !query.resourceId) {
      return err(
        domainError.sourceEventScopeRequired(
          "Source event detail requires project or resource scope",
          {
            phase: "source-event-read",
            sourceEventId: query.sourceEventId,
            requiredScopeKind: "project-or-resource",
          },
        ),
      );
    }

    const sourceEvent = await this.sourceEventReadModel.findOne(toRepositoryContext(context), {
      sourceEventId: query.sourceEventId,
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
    });

    if (!sourceEvent) {
      return err(
        domainError.sourceEventNotFound("Source event was not found", {
          phase: "source-event-read",
          sourceEventId: query.sourceEventId,
        }),
      );
    }

    return ok(sourceEvent);
  }
}
