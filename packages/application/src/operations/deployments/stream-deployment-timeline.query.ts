import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import {
  type DeploymentTimelineKind,
  type DeploymentTimelineSource,
  type StreamDeploymentTimelineResult,
} from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type StreamDeploymentTimelineQueryInput,
  streamDeploymentTimelineQueryInputSchema,
} from "./deployment-timeline.schema";

export {
  type StreamDeploymentTimelineQueryInput,
  streamDeploymentTimelineQueryInputSchema,
} from "./deployment-timeline.schema";

export class StreamDeploymentTimelineQuery extends Query<StreamDeploymentTimelineResult> {
  constructor(
    public readonly deploymentId: string,
    public readonly limit: number,
    public readonly includeHistory: boolean,
    public readonly follow: boolean,
    public readonly untilTerminal: boolean,
    public readonly signal?: AbortSignal,
    public readonly cursor?: string,
    public readonly kinds?: DeploymentTimelineKind[],
    public readonly sources?: DeploymentTimelineSource[],
  ) {
    super();
  }

  static create(
    input: StreamDeploymentTimelineQueryInput,
    options?: {
      signal?: AbortSignal;
    },
  ): Result<StreamDeploymentTimelineQuery> {
    return parseOperationInput(streamDeploymentTimelineQueryInputSchema, input).map((parsed) => {
      const cursor = trimToUndefined(parsed.cursor);
      const includeHistory = parsed.includeHistory ?? !cursor;

      return new StreamDeploymentTimelineQuery(
        parsed.deploymentId,
        parsed.limit,
        includeHistory,
        parsed.follow,
        parsed.untilTerminal,
        options?.signal,
        cursor,
        parsed.kinds,
        parsed.sources,
      );
    });
  }
}
