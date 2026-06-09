import { inject, injectable } from "tsyringe";

import { QueryHandler, type QueryHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { type StreamOperatorWorkEventsResult } from "../../ports";
import { tokens } from "../../tokens";
import { StreamOperatorWorkEventsQuery } from "./stream-operator-work-events.query";
import { type StreamOperatorWorkEventsQueryService } from "./stream-operator-work-events.query-service";

@QueryHandler(StreamOperatorWorkEventsQuery)
@injectable()
export class StreamOperatorWorkEventsQueryHandler
  implements QueryHandlerContract<StreamOperatorWorkEventsQuery, StreamOperatorWorkEventsResult>
{
  constructor(
    @inject(tokens.streamOperatorWorkEventsQueryService)
    private readonly queryService: StreamOperatorWorkEventsQueryService,
  ) {}

  handle(context: ExecutionContext, query: StreamOperatorWorkEventsQuery) {
    return this.queryService.execute(context, query);
  }
}
