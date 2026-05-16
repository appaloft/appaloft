import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ResourceHealthHistory } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ResourceHealthHistoryQueryInput,
  type ResourceHealthHistoryQueryParsedInput,
  resourceHealthHistoryQueryInputSchema,
} from "./resource-health.schema";

export {
  type ResourceHealthHistoryQueryInput,
  type ResourceHealthHistoryQueryParsedInput,
  resourceHealthHistoryQueryInputSchema,
} from "./resource-health.schema";

export class ResourceHealthHistoryQuery extends Query<ResourceHealthHistory> {
  constructor(public readonly input: ResourceHealthHistoryQueryParsedInput) {
    super();
  }

  static create(input: ResourceHealthHistoryQueryInput): Result<ResourceHealthHistoryQuery> {
    return parseOperationInput(resourceHealthHistoryQueryInputSchema, input).map(
      (parsed) => new ResourceHealthHistoryQuery(parsed),
    );
  }
}
