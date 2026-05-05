import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type SourceEventDetail } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ShowSourceEventQueryInput,
  showSourceEventQueryInputSchema,
} from "./show-source-event.schema";

export { type ShowSourceEventQueryInput, showSourceEventQueryInputSchema };

export class ShowSourceEventQuery extends Query<SourceEventDetail> {
  constructor(
    public readonly sourceEventId: string,
    public readonly projectId?: string,
    public readonly resourceId?: string,
  ) {
    super();
  }

  static create(input: ShowSourceEventQueryInput): Result<ShowSourceEventQuery> {
    return parseOperationInput(showSourceEventQueryInputSchema, input).map(
      (parsed) =>
        new ShowSourceEventQuery(
          parsed.sourceEventId,
          trimToUndefined(parsed.projectId),
          trimToUndefined(parsed.resourceId),
        ),
    );
  }
}
