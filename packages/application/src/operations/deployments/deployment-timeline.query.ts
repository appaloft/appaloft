import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import {
  type DeploymentTimelineKind,
  type DeploymentTimelineReadResult,
  type DeploymentTimelineSource,
} from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type DeploymentTimelineQueryInput,
  deploymentTimelineQueryInputSchema,
} from "./deployment-timeline.schema";

export {
  type DeploymentTimelineQueryInput,
  deploymentTimelineQueryInputSchema,
} from "./deployment-timeline.schema";

export class DeploymentTimelineQuery extends Query<DeploymentTimelineReadResult> {
  constructor(
    public readonly deploymentId: string,
    public readonly limit: number,
    public readonly cursor?: string,
    public readonly kinds?: DeploymentTimelineKind[],
    public readonly sources?: DeploymentTimelineSource[],
  ) {
    super();
  }

  static create(input: DeploymentTimelineQueryInput): Result<DeploymentTimelineQuery> {
    return parseOperationInput(deploymentTimelineQueryInputSchema, input).map((parsed) => {
      return new DeploymentTimelineQuery(
        parsed.deploymentId,
        parsed.limit,
        trimToUndefined(parsed.cursor),
        parsed.kinds,
        parsed.sources,
      );
    });
  }
}
