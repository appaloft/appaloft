import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type StreamDeploymentEventsResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type StreamDeploymentEventsQueryInput,
  streamDeploymentEventsQueryInputSchema,
} from "./stream-deployment-events.schema";

export {
  type StreamDeploymentEventsQueryInput,
  streamDeploymentEventsQueryInputSchema,
} from "./stream-deployment-events.schema";

export class StreamDeploymentEventsQuery extends Query<StreamDeploymentEventsResult> {
  constructor(
    public readonly deploymentId: string,
    public readonly historyLimit: number,
    public readonly includeHistory: boolean,
    public readonly follow: boolean,
    public readonly untilTerminal: boolean,
    public readonly signal?: AbortSignal,
    public readonly cursor?: string,
  ) {
    super();
  }

  static create(
    input: StreamDeploymentEventsQueryInput,
    options?: {
      signal?: AbortSignal;
    },
  ): Result<StreamDeploymentEventsQuery> {
    return parseOperationInput(streamDeploymentEventsQueryInputSchema, input).map((parsed) => {
      const cursor = trimToUndefined(parsed.cursor);
      const includeHistory = parsed.includeHistory ?? !cursor;

      return new StreamDeploymentEventsQuery(
        parsed.deploymentId,
        parsed.historyLimit,
        includeHistory,
        parsed.follow,
        parsed.untilTerminal,
        options?.signal,
        cursor,
      );
    });
  }
}
