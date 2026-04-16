import { type Result } from "@yundu/core";

import { Query } from "../../cqrs";
import { type ResourceHealthSummary } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ResourceHealthQueryInput,
  resourceHealthQueryInputSchema,
} from "./resource-health.schema";

export {
  type ResourceHealthQueryInput,
  resourceHealthQueryInputSchema,
} from "./resource-health.schema";

export class ResourceHealthQuery extends Query<ResourceHealthSummary> {
  constructor(
    public readonly resourceId: string,
    public readonly mode: "cached" | "live",
    public readonly includeChecks: boolean,
    public readonly includePublicAccessProbe: boolean,
    public readonly includeRuntimeProbe: boolean,
  ) {
    super();
  }

  static create(input: ResourceHealthQueryInput): Result<ResourceHealthQuery> {
    return parseOperationInput(resourceHealthQueryInputSchema, input).map(
      (parsed) =>
        new ResourceHealthQuery(
          parsed.resourceId,
          parsed.mode,
          parsed.includeChecks,
          parsed.includePublicAccessProbe,
          parsed.includeRuntimeProbe,
        ),
    );
  }
}
