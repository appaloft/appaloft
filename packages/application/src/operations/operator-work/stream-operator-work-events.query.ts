import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type StreamOperatorWorkEventsResult } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type StreamOperatorWorkEventsQueryInput,
  streamOperatorWorkEventsQueryInputSchema,
} from "./stream-operator-work-events.schema";

export {
  type StreamOperatorWorkEventsQueryInput,
  streamOperatorWorkEventsQueryInputSchema,
} from "./stream-operator-work-events.schema";

export class StreamOperatorWorkEventsQuery extends Query<StreamOperatorWorkEventsResult> {
  constructor(
    public readonly workId: string,
    public readonly historyLimit: number,
    public readonly includeHistory: boolean,
    public readonly follow: boolean,
    public readonly untilTerminal: boolean,
    public readonly pollIntervalMs: number,
    public readonly signal?: AbortSignal,
    public readonly cursor?: string,
  ) {
    super();
  }

  static create(
    input: StreamOperatorWorkEventsQueryInput,
    options?: {
      signal?: AbortSignal;
    },
  ): Result<StreamOperatorWorkEventsQuery> {
    return parseOperationInput(streamOperatorWorkEventsQueryInputSchema, input).map((parsed) => {
      const cursor = trimToUndefined(parsed.cursor);
      const includeHistory = parsed.includeHistory ?? !cursor;

      return new StreamOperatorWorkEventsQuery(
        parsed.workId,
        parsed.historyLimit,
        includeHistory,
        parsed.follow,
        parsed.untilTerminal,
        parsed.pollIntervalMs,
        options?.signal,
        cursor,
      );
    });
  }
}
