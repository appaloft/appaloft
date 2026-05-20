import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  ListDeploymentOverlayDecisionsQuery,
  type ListDeploymentOverlayDecisionsResponse,
} from "./list-deployment-overlay-decisions.query";
import { type ListDeploymentOverlayDecisionsQueryService } from "./list-deployment-overlay-decisions.query-service";

@QueryHandler(ListDeploymentOverlayDecisionsQuery)
@injectable()
export class ListDeploymentOverlayDecisionsQueryHandler
  implements
    QueryHandlerContract<
      ListDeploymentOverlayDecisionsQuery,
      ListDeploymentOverlayDecisionsResponse
    >
{
  constructor(
    @inject(tokens.listDeploymentOverlayDecisionsQueryService)
    private readonly service: ListDeploymentOverlayDecisionsQueryService,
  ) {}

  async handle(context: ExecutionContext, query: ListDeploymentOverlayDecisionsQuery) {
    return this.service.execute(context, query);
  }
}
