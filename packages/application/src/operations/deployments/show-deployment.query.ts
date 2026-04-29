import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type DeploymentDetail } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ShowDeploymentQueryInput,
  showDeploymentQueryInputSchema,
} from "./show-deployment.schema";

export {
  type ShowDeploymentQueryInput,
  showDeploymentQueryInputSchema,
} from "./show-deployment.schema";

export class ShowDeploymentQuery extends Query<DeploymentDetail> {
  constructor(
    public readonly deploymentId: string,
    public readonly includeTimeline: boolean,
    public readonly includeSnapshot: boolean,
    public readonly includeRelatedContext: boolean,
    public readonly includeLatestFailure: boolean,
    public readonly includeRecoverySummary: boolean,
  ) {
    super();
  }

  static create(input: ShowDeploymentQueryInput): Result<ShowDeploymentQuery> {
    return parseOperationInput(showDeploymentQueryInputSchema, input).map(
      (parsed) =>
        new ShowDeploymentQuery(
          parsed.deploymentId,
          parsed.includeTimeline,
          parsed.includeSnapshot,
          parsed.includeRelatedContext,
          parsed.includeLatestFailure,
          parsed.includeRecoverySummary,
        ),
    );
  }
}
